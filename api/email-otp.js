/**
 * Email verification OTP for merchant registration.
 *
 * The browser only ever sends the email / the 6-digit code. The code is
 * generated here, stored as an HMAC (never in plaintext) in Firestore with
 * a short expiry and attempt cap, and delivered through Resend using the
 * server-only RESEND_API_KEY. A successful verification marks the signed-in
 * merchant's users/{uid} account as verified.
 */
import crypto from 'node:crypto'
import { Resend } from 'resend'
import { db, safeEqual, sendJson, verifyAuthToken } from './_lib/settle.js'

const TTL_MS = 5 * 60 * 1000
// Slightly shorter than the UI's 30s timer so a legitimate resend isn't
// rejected by rounding at the boundary.
const COOLDOWN_MS = 25 * 1000
const MAX_ATTEMPTS = 5
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function codeHash(uid, email, code) {
  // The API key is already a server-only secret, so it doubles as the HMAC
  // pepper — no second secret to manage.
  return crypto
    .createHmac('sha256', process.env.RESEND_API_KEY || '')
    .update(`${uid}:${email}:${code}`)
    .digest('hex')
}

function mailer() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured')
  return new Resend(process.env.RESEND_API_KEY)
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return {}
    }
  }
  return {}
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return sendJson(res, 405, { error: 'Method not allowed' })
  }

  let uid
  try {
    uid = await verifyAuthToken(req)
  } catch {
    return sendJson(res, 401, { error: 'Sign in to verify your email.' })
  }

  const body = readBody(req)
  const ref = db().collection('emailOtps').doc(uid)

  try {
    if (body.action === 'send') {
      const email = String(body.email ?? '').trim().toLowerCase()
      if (!EMAIL_RE.test(email)) {
        return sendJson(res, 400, { error: 'Enter a valid email address.' })
      }

      const snap = await ref.get()
      const previous = snap.exists() ? snap.data() : null
      const sentAt = previous?.sentAt?.toMillis?.() ?? 0
      const wait = Math.ceil((COOLDOWN_MS - (Date.now() - sentAt)) / 1000)
      if (wait > 0) {
        return sendJson(res, 429, { error: `Wait ${wait}s before requesting another code.`, wait })
      }

      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
      const result = await mailer().emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'NearZoop <onboarding@resend.dev>',
        to: [email],
        subject: 'Your NearZoop verification code',
        text: `${code} is your NearZoop merchant verification code. It expires in 5 minutes. If you didn't request this, ignore this email.`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.5"><h2>Verify your email</h2><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>This code expires in 5 minutes. If you didn't request it, you can ignore this email.</p></div>`,
      })
      if (result.error) throw new Error(result.error.message || 'Email could not be sent.')

      await ref.set(
        {
          email,
          hash: codeHash(uid, email, code),
          expiresAt: new Date(Date.now() + TTL_MS),
          attempts: 0,
          sentAt: new Date(),
        },
        { merge: true },
      )
      return sendJson(res, 200, { ok: true })
    }

    if (body.action === 'verify') {
      const snap = await ref.get()
      const record = snap.exists() ? snap.data() : null
      if (!record) {
        return sendJson(res, 400, { error: 'Request a code first.' })
      }
      if (record.expiresAt?.toMillis?.() < Date.now()) {
        return sendJson(res, 400, { error: 'That code expired. Request a new one.' })
      }
      if ((record.attempts ?? 0) >= MAX_ATTEMPTS) {
        return sendJson(res, 429, { error: 'Too many attempts. Request a new code.' })
      }

      const code = String(body.code ?? '').replace(/\D/g, '')
      if (code.length !== 6 || !safeEqual(codeHash(uid, record.email, code), record.hash)) {
        await ref.update({ attempts: (record.attempts ?? 0) + 1 })
        return sendJson(res, 400, {
          error: 'Wrong code. Check your email and try again.',
          attemptsLeft: Math.max(0, MAX_ATTEMPTS - (record.attempts ?? 0) - 1),
        })
      }

      const batch = db().batch()
      batch.delete(ref)
      batch.set(
        db().collection('users').doc(uid),
        {
          email: record.email,
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
        { merge: true },
      )
      await batch.commit()
      return sendJson(res, 200, { ok: true, email: record.email })
    }

    return sendJson(res, 400, { error: 'Unknown action.' })
  } catch (err) {
    console.error('email-otp failed:', err)
    return sendJson(res, 500, { error: "Couldn't complete that. Try again." })
  }
}
