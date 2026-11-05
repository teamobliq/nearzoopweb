/**
 * POST /api/razorpay-order
 *
 * Creates the ₹1,000/year shop-verification order server-side. The browser
 * proves who it is with a Firebase ID token — the shop is ALWAYS the
 * token's uid, never anything the client sends.
 *
 * Body: none (empty JSON object is fine).
 * 200 → { orderId, amount, currency, keyId }
 * 401 → bad/missing token · 405 → wrong method · 500 → generic message
 */

import { razorpayKeyId, razorpayRest, sendJson, verifyAuthToken } from './_lib/settle.js'

const AMOUNT = 100000 // ₹1,000 in paise
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
    console.error('razorpay-order: auth check failed:', err.message)
    return sendJson(res, 500, { error: 'Could not verify your session. Try again later.' })
  }

  // Razorpay receipts: max 40 chars. uid truncated + base36 timestamp keeps
  // it unique per attempt and well under the limit.
  const receipt = `shop_${uid.slice(0, 20)}_${Date.now().toString(36)}`

  try {
    const order = await razorpayRest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        amount: AMOUNT,
        currency: CURRENCY,
        receipt,
        notes: { shopUid: uid },
      }),
    })
    return sendJson(res, 200, {
      orderId: order.id,
      amount: AMOUNT,
      currency: CURRENCY,
      keyId: razorpayKeyId(),
    })
  } catch (err) {
    console.error('razorpay-order: order creation failed:', err.message)
    return sendJson(res, 500, { error: 'Could not start the payment. Try again later.' })
  }
}
