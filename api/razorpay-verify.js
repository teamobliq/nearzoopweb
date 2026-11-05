/**
 * POST /api/razorpay-verify
 *
 * Client-side confirmation after Checkout returns. Verifies the signature
 * Razorpay gave the browser, then double-checks the payment with Razorpay's
 * REST API before settling the fee server-side. The browser never writes
 * paymentDone/feeExpiresAt itself.
 *
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * 200 → { ok: true, feeExpiresAt } · 400 → bad/missing fields or signature
 *       · 401 → bad token · 405 → wrong method · 500 → generic message
 *
 * Idempotent (safe to retry): settleFee skips re-applying the fee math when
 * the payment was already captured.
 */

import {
  hmacSha256,
  razorpayRest,
  safeEqual,
  sendJson,
  settleFee,
  verifyAuthToken,
} from './_lib/settle.js'

const AMOUNT = 100000
const CURRENCY = 'INR'

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' })
  }

  let uid
  try {
    uid = await verifyAuthToken(req)
  } catch (err) {
    if (err.status === 401) {
      return sendJson(res, 401, { error: 'Not signed in — reload and sign in again.' })
    }
    console.error('razorpay-verify: auth check failed:', err.message)
    return sendJson(res, 500, { error: 'Could not verify your session. Try again later.' })
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body ?? {}
  if (
    typeof razorpay_order_id !== 'string' ||
    typeof razorpay_payment_id !== 'string' ||
    typeof razorpay_signature !== 'string' ||
    !razorpay_order_id ||
    !razorpay_payment_id ||
    !razorpay_signature
  ) {
    return sendJson(res, 400, { error: 'Missing payment fields — the signature was not returned.' })
  }

  const secret = process.env.RAZORPAY_KEY_SECRET
  if (!secret) {
    console.error('razorpay-verify: RAZORPAY_KEY_SECRET is not set')
    return sendJson(res, 500, { error: 'Payments are not configured on the server.' })
  }

  // Standard Checkout signature: HMAC_SHA256("<order_id>|<payment_id>", secret).
  const expected = hmacSha256(`${razorpay_order_id}|${razorpay_payment_id}`, secret)
  if (!safeEqual(expected, razorpay_signature)) {
    return sendJson(res, 400, { error: 'Payment signature did not match.' })
  }

  try {
    // Signature only proves Razorpay issued the pair — confirm with the API
    // that the money actually moved, for the right amount, to this shop.
    const payment = await razorpayRest(`/payments/${encodeURIComponent(razorpay_payment_id)}`)

    let notesShopUid = payment?.notes?.shopUid ?? null
    if (!notesShopUid && payment?.order_id) {
      // Notes absent on the payment — fall back to the order's notes.
      const order = await razorpayRest(`/orders/${encodeURIComponent(payment.order_id)}`)
      notesShopUid = order?.notes?.shopUid ?? null
    }

    const valid =
      payment?.status === 'captured' &&
      payment?.amount === AMOUNT &&
      payment?.currency === CURRENCY &&
      payment?.order_id === razorpay_order_id &&
      notesShopUid === uid

    if (!valid) {
      console.error('razorpay-verify: payment failed server-side checks', {
        paymentId: razorpay_payment_id,
        status: payment?.status ?? 'unknown',
      })
      return sendJson(res, 400, { error: 'Payment could not be verified.' })
    }

    const { feeExpiresAt } = await settleFee({
      shopUid: uid,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      amount: AMOUNT,
      currency: CURRENCY,
      via: 'verify',
    })
    return sendJson(res, 200, { ok: true, feeExpiresAt })
  } catch (err) {
    console.error('razorpay-verify: unexpected error:', err.message)
    return sendJson(res, 500, {
      error: 'Could not verify the payment. If money was deducted, contact support.',
    })
  }
}
