/**
 * POST /api/razorpay-webhook
 *
 * Razorpay's own server-to-server callback — the backstop that settles the
 * fee even if the merchant's browser never confirms (closed tab, dead
 * network). Must read the RAW request body for signature verification, so
 * Vercel's body parser is disabled for this route.
 *
 * Events:
 *   payment.captured → settleFee(via: 'webhook') — idempotent with the
 *                      client-side /api/razorpay-verify path
 *   payment.failed   → logged, nothing written
 *   anything else    → 200 { ignored: true }
 *
 * Responds quickly with 200 so Razorpay doesn't retry; non-2xx responses
 * trigger Razorpay's automatic webhook retry.
 *
 * 200 → { ok: true } | { ignored: true }
 * 400 → bad signature/payload/no shop ref · 405 → wrong method
 * 500 → generic message (Razorpay will retry)
 */

import {
  hmacSha256,
  razorpayRest,
  safeEqual,
  sendJson,
  settleFee,
} from './_lib/settle.js'

export const config = { api: { bodyParser: false } }

/** Collects the raw request stream into a Buffer (bodyParser is off). */
async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' })
  }

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) {
    console.error('razorpay-webhook: RAZORPAY_WEBHOOK_SECRET is not set')
    return sendJson(res, 500, { error: 'Webhook is not configured on the server.' })
  }

  const rawBody = await readRawBody(req)
  const signature = req.headers['x-razorpay-signature']
  if (
    typeof signature !== 'string' ||
    !safeEqual(hmacSha256(rawBody, secret), signature)
  ) {
    return sendJson(res, 400, { error: 'Invalid webhook signature.' })
  }

  let event
  try {
    event = JSON.parse(rawBody.toString('utf8'))
  } catch {
    return sendJson(res, 400, { error: 'Malformed webhook payload.' })
  }

  if (event?.event === 'payment.failed') {
    // Log only — no shop state changes on a failed capture.
    console.warn('razorpay-webhook: payment.failed', {
      paymentId: event?.payload?.payment?.entity?.id ?? 'unknown',
    })
    return sendJson(res, 200, { ok: true })
  }

  if (event?.event !== 'payment.captured') {
    return sendJson(res, 200, { ignored: true })
  }

  const entity = event?.payload?.payment?.entity
  if (!entity?.id) {
    return sendJson(res, 400, { error: 'Malformed payment entity in payload.' })
  }

  let shopUid = entity.notes?.shopUid ?? null
  if (!shopUid && entity.order_id) {
    try {
      const order = await razorpayRest(`/orders/${encodeURIComponent(entity.order_id)}`)
      shopUid = order?.notes?.shopUid ?? null
    } catch (err) {
      console.error('razorpay-webhook: order lookup failed:', err.message)
      return sendJson(res, 500, { error: 'Could not resolve the order for this payment.' })
    }
  }

  if (!shopUid) {
    console.error('razorpay-webhook: no shop reference for payment', { paymentId: entity.id })
    return sendJson(res, 400, { error: 'No shop reference on this payment.' })
  }

  try {
    await settleFee({
      shopUid,
      paymentId: entity.id,
      orderId: entity.order_id ?? null,
      amount: entity.amount ?? 100000,
      currency: entity.currency ?? 'INR',
      via: 'webhook',
    })
    return sendJson(res, 200, { ok: true })
  } catch (err) {
    console.error('razorpay-webhook: settle failed:', err.message)
    return sendJson(res, 500, { error: 'Could not record the payment.' })
  }
}
