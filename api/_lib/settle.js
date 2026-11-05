/**
 * Shared plumbing for the Razorpay Vercel functions (api/*.js).
 *
 * Server-only module — nothing here may reach the browser bundle. Secrets
 * are read from the environment at call time; no value is ever logged.
 * Plain modern JS (no TypeScript, no imports from src/) because the root
 * package.json is "type": "module" and api/ is not covered by tsconfig.
 */

import crypto from 'node:crypto'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const YEAR_MS = 365 * 24 * 60 * 60 * 1000

/** Error carrying an HTTP status so handlers can answer without a stack. */
function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

let cachedApp = null

/** Initialises (once per process) and returns the admin app. Throws a clear
 *  error when the service-account env vars are not configured. */
function adminApp() {
  if (cachedApp) return cachedApp
  const existing = getApps()
  if (existing.length > 0) {
    cachedApp = existing[0]
    return cachedApp
  }
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase admin credentials missing — set FIREBASE_ADMIN_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY',
    )
  }
  cachedApp = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
  return cachedApp
}

/** Lazy Firestore getter — throws the credentials error only when actually used. */
export function db() {
  return getFirestore(adminApp())
}

/** Sets the headers every function response carries. */
export function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

/** Firebase ID tokens are RS256-signed JWTs issued by Google. Instead of
 *  pulling in firebase-admin/auth (which drags in jwks-rsa → jose ESM that
 *  crashes on Vercel's Node runtime), verify the JWT manually:
 *  1. Decode header + payload
 *  2. Check iss / aud / exp claims
 *  3. Verify the RSA-SHA256 signature against Google's public certs
 * Returns the merchant's uid; throws httpError(401, …) on any failure. */
const GOOGLE_PUBKEYS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'

let pubkeysCache = { keys: null, fetchedAt: 0 }

async function fetchGooglePublicKeys() {
  const now = Date.now()
  if (pubkeysCache.keys && now - pubkeysCache.fetchedAt < 3_600_000) {
    return pubkeysCache.keys
  }
  const res = await fetch(GOOGLE_PUBKEYS_URL)
  if (!res.ok) throw new Error(`Google certs fetch failed (${res.status})`)
  pubkeysCache = { keys: await res.json(), fetchedAt: now }
  return pubkeysCache.keys
}

export async function verifyAuthToken(req) {
  const header = req.headers?.authorization ?? req.headers?.Authorization ?? ''
  const match = /^Bearer\s+(\S+)$/.exec(typeof header === 'string' ? header : '')
  if (!match) {
    throw httpError(401, 'Missing bearer token')
  }

  const token = match[1]
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw httpError(401, 'Invalid token format')
  }

  let tokenHeader, tokenPayload
  try {
    tokenHeader = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
    tokenPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
  } catch {
    throw httpError(401, 'Invalid token content')
  }

  if (tokenHeader.alg !== 'RS256') {
    throw httpError(401, 'Invalid token algorithm')
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const now = Math.floor(Date.now() / 1000)
  if (tokenPayload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw httpError(401, 'Invalid issuer')
  }
  if (tokenPayload.aud !== projectId) {
    throw httpError(401, 'Invalid audience')
  }
  if (!tokenPayload.exp || tokenPayload.exp < now) {
    throw httpError(401, 'Token expired')
  }

  const keys = await fetchGooglePublicKeys()
  const certPEM = keys[tokenHeader.kid]
  if (!certPEM) {
    throw httpError(401, 'Unknown key ID')
  }

  const signingData = `${parts[0]}.${parts[1]}`
  const signature = Buffer.from(parts[2], 'base64url')
  const verifier = crypto.createVerify('RSA-SHA256')
  verifier.update(signingData)
  verifier.end()
  if (!verifier.verify(certPEM, signature)) {
    throw httpError(401, 'Invalid signature')
  }

  return tokenPayload.sub
}

/** Timing-safe string compare for hex digests/signatures. */
export function safeEqual(a, b) {
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

/** SHA-256 HMAC of `payload` (string | Buffer) as hex. */
export function hmacSha256(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * Settles the annual shop fee in a single Firestore transaction.
 *
 * - Extends the paid year from max(now, existing feeExpiresAt) — renewing
 *   early never burns remaining paid days.
 * - Writes ONLY the payment fields onto shops/{shopUid} (merge), never
 *   touching anything else; a not-yet-verified shop is flipped back to
 *   'pending' so the admin queue sees the payment.
 * - Idempotent: if payments/{paymentId} already exists with status
 *   'captured', the fee math is NOT applied a second time (webhook and
 *   client-side verify may both fire). The caller still gets ok:true.
 *
 * Returns { feeExpiresAt } (the existing one on an idempotent replay, or
 * null when the shop document somehow pre-existed without one — it always
 * exists on the fresh path).
 */
export async function settleFee({ shopUid, paymentId, orderId, amount, currency, via }) {
  const firestore = db()
  const shopRef = firestore.collection('shops').doc(shopUid)
  const paymentRef = firestore.collection('payments').doc(paymentId)

  const result = await firestore.runTransaction(async (tx) => {
    const [shopSnap, paymentSnap] = await Promise.all([tx.get(shopRef), tx.get(paymentRef)])
    const shop = shopSnap.exists ? shopSnap.data() : null

    if (paymentSnap.exists && paymentSnap.data()?.status === 'captured') {
      // Already settled — return the stored state, write nothing.
      return { feeExpiresAt: shop?.feeExpiresAt ?? null }
    }

    const now = Date.now()
    const currentExpiry = shop?.feeExpiresAt ? Date.parse(shop.feeExpiresAt) : 0
    const effectiveStart = Math.max(now, Number.isFinite(currentExpiry) ? currentExpiry : 0)
    const feeExpiresAt = new Date(effectiveStart + YEAR_MS).toISOString()

    const shopPatch = {
      paymentDone: true,
      paymentId,
      feeExpiresAt,
      setupDone: true,
      ...(shop?.verification === 'verified' ? {} : { verification: 'pending' }),
    }
    tx.set(shopRef, shopPatch, { merge: true })
    tx.set(paymentRef, {
      shopUid,
      paymentId,
      orderId: orderId ?? null,
      amount,
      currency: currency ?? 'INR',
      status: 'captured',
      via,
      at: new Date().toISOString(),
    })
    return { feeExpiresAt }
  })

  return { feeExpiresAt: result.feeExpiresAt }
}

/** Server-side key ID: prefer the server-only name, fall back to the public VITE_ one. */
export function razorpayKeyId() {
  return process.env.RAZORPAY_KEY_ID ?? process.env.VITE_RAZORPAY_KEY_ID ?? null
}

/**
 * Minimal authenticated client for Razorpay's REST API.
 * Throws (with Razorpay's error body attached) on any non-2xx response —
 * callers decide what the client may see; nothing here is secret-safe to
 * forward verbatim to browsers, so handlers sanitise.
 */
export async function razorpayRest(path, opts = {}) {
  const keyId = razorpayKeyId()
  const secret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || !secret) {
    throw new Error('Razorpay keys missing — set RAZORPAY_KEY_SECRET (and RAZORPAY_KEY_ID or VITE_RAZORPAY_KEY_ID)')
  }
  const basic = Buffer.from(`${keyId}:${secret}`).toString('base64')
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...opts,
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Razorpay API error (${res.status}) for ${path}: ${body}`)
  }
  if (res.status === 204) return null
  return res.json()
}
