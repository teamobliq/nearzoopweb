/**
 * POST /api/rate-prompt
 *
 * Called after either side of a redemption interaction, so the customer
 * gets exactly one "how was it?" nudge per offer:
 *
 *   - the customer claims a coupon (caller === customerUid), or
 *   - the shop scans the coupon at the counter (caller === shopUid), or
 *   - an allow-listed admin acts on either side of the flow.
 *
 * Writes one deterministic item into the customer's inbox — idempotent,
 * so both sides calling this lands a single prompt. Skips silently when
 * the customer has already rated this offer.
 *
 * Body: { shopUid, customerUid, offerId, offerTitle?, discountLabel? }
 * 200 → { ok, prompted } · 400 → bad fields · 401 → bad token
 * 403 → not one of the three callers · 405 → wrong method · 404 → no shop
 */

import {
  db,
  sendJson,
  verifyAuthPayload,
  verifyAuthToken,
} from './_lib/settle.js'
import { FieldValue } from 'firebase-admin/firestore'

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' })
  }

  let callerUid
  let callerEmail
  try {
    const payload = await verifyAuthPayload(req)
    callerUid = payload.sub
    callerEmail =
      typeof payload.email === 'string' ? payload.email.toLowerCase() : ''
  } catch (err) {
    if (err.status === 401) {
      return sendJson(res, 401, { error: 'Not signed in — reload and sign in again.' })
    }
    console.error('rate-prompt: auth check failed:', err.message)
    return sendJson(res, 500, { error: 'Could not verify your session. Try again later.' })
  }

  const { shopUid, customerUid, offerId, offerTitle, discountLabel } = req.body ?? {}
  if (
    typeof shopUid !== 'string' || !shopUid ||
    typeof customerUid !== 'string' || !customerUid ||
    typeof offerId !== 'string' || !offerId ||
    (offerTitle !== undefined && typeof offerTitle !== 'string') ||
    (discountLabel !== undefined && typeof discountLabel !== 'string')
  ) {
    return sendJson(res, 400, { error: 'Missing or invalid shopUid / customerUid / offerId.' })
  }

  const adminEmails = (process.env.VITE_ADMIN_EMAILS ?? process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  const isCallerAdmin = callerEmail && adminEmails.includes(callerEmail)
  const allowed =
    callerUid === customerUid || callerUid === shopUid || isCallerAdmin
  if (!allowed) {
    return sendJson(res, 403, { error: 'Not allowed to send this prompt.' })
  }

  let shopName = 'The shop'
  try {
    const shopSnap = await db().collection('shops').doc(shopUid).get()
    if (!shopSnap.exists) {
      return sendJson(res, 404, { error: 'No such shop.' })
    }
    const name = shopSnap.data()?.name
    if (typeof name === 'string' && name.trim()) shopName = name.trim()
  } catch (err) {
    console.error('rate-prompt: shop read failed:', err)
  }

  // Already rated? Then there is nothing to ask about.
  try {
    const existing = await db()
      .collection('shops').doc(shopUid)
      .collection('reviews')
      .where('offerId', '==', offerId)
      .where('customerUid', '==', customerUid)
      .limit(1)
      .get()
    if (!existing.empty) {
      return sendJson(res, 200, { ok: true, prompted: false })
    }
  } catch (err) {
    console.error('rate-prompt: review check failed:', err)
  }

  const title = offerTitle?.trim() || 'the offer'
  const body = discountLabel?.trim()
    ? `Rate ${title} and ${shopName} — it helps other customers.`
    : `Rate ${title} and ${shopName}.`

  try {
    await db()
      .collection('customerNotifications').doc(customerUid)
      .collection('items').doc(`rate-${shopUid}-${offerId}-${customerUid}`)
      .set(
        {
          kind: 'rate-offer',
          title: 'How was it?',
          body,
          shopUid,
          shopName,
          offerId,
          offerTitle: title,
          read: false,
          at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
  } catch (err) {
    console.error('rate-prompt: inbox write failed:', err)
    return sendJson(res, 500, { error: 'Could not send the prompt.' })
  }

  return sendJson(res, 200, { ok: true, prompted: true })
}
