/**
 * POST /api/notify-followers
 *
 * Called by the shop (or an admin) the moment an offer goes live. Fans
 * the offer out to every follower of the shop on both channels at once:
 *
 *   1. In-app inbox — one `customerNotifications/{cid}/items/{id}` doc
 *      per follower, deterministic doc id (idempotent — re-running the
 *      sync never double-notifies).
 *   2. Web push — FCM `sendEachForMulticast` to every registered device
 *      token the followers hold. Tokens that FCM rejects as dead are
 *      deleted so the list self-heals.
 *
 * Body: { shopUid, offerId, offerTitle?, discountLabel? }
 * 200 → { ok, followers, notified, sent, failed, pruned }
 * 400 → missing/invalid fields · 401 → bad token
 * 403 → not the shop's owner and not an allow-listed admin · 405 → wrong method
 */

import {
  db,
  sendJson,
  verifyAuthPayload,
  verifyAuthToken,
} from './_lib/settle.js'
import { FieldValue } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'

const BATCH_LIMIT = 400
const MULTICAST_LIMIT = 500

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
    callerEmail = typeof payload.email === 'string' ? payload.email.toLowerCase() : ''
  } catch (err) {
    if (err.status === 401) {
      return sendJson(res, 401, { error: 'Not signed in — reload and sign in again.' })
    }
    console.error('notify-followers: auth check failed:', err.message)
    return sendJson(res, 500, { error: 'Could not verify your session. Try again later.' })
  }

  const { shopUid, offerId, offerTitle, discountLabel } = req.body ?? {}
  if (
    typeof shopUid !== 'string' || !shopUid ||
    typeof offerId !== 'string' || !offerId ||
    (offerTitle !== undefined && typeof offerTitle !== 'string') ||
    (discountLabel !== undefined && typeof discountLabel !== 'string')
  ) {
    return sendJson(res, 400, { error: 'Missing or invalid shopUid / offerId.' })
  }

  // The owner may notify their own followers; an allow-listed admin may
  // notify any shop (the approval path calls this as well).
  const adminEmails = (process.env.VITE_ADMIN_EMAILS ?? process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  const isCallerAdmin = callerEmail && adminEmails.includes(callerEmail)
  if (callerUid !== shopUid && !isCallerAdmin) {
    return sendJson(res, 403, { error: 'Not allowed to notify this shop.' })
  }

  let shopName = 'The shop'
  try {
    const shopSnap = await db().collection('shops').doc(shopUid).get()
    const name = shopSnap.exists ? shopSnap.data()?.name : null
    if (typeof name === 'string' && name.trim()) shopName = name.trim()
  } catch (err) {
    console.error('notify-followers: shop read failed:', err)
  }

  const title = offerTitle?.trim() || 'a new offer'
  const body = discountLabel?.trim() ? `${title} — ${discountLabel.trim()}` : title
  const offerUrl = `/${encodeURIComponent(shopUid)}/${encodeURIComponent(offerId)}`

  // 1. Resolve the audience.
  const followersSnap = await db()
    .collection('shops').doc(shopUid)
    .collection('followers')
    .get()
  const followerUids = followersSnap.docs.map((doc) => doc.id)

  if (followerUids.length === 0) {
    return sendJson(res, 200, { ok: true, followers: 0, notified: 0, sent: 0, failed: 0, pruned: 0 })
  }

  // 2. In-app inbox — deterministic ids, all-or-nothing per chunk.
  let notified = 0
  for (let i = 0; i < followerUids.length; i += BATCH_LIMIT) {
    const batch = db().batch()
    for (const cid of followerUids.slice(i, i + BATCH_LIMIT)) {
      const ref = db()
        .collection('customerNotifications').doc(cid)
        .collection('items').doc(`follow-${shopUid}-${offerId}-${cid}`)
      batch.set(ref, {
        kind: 'new-offer',
        title: `${shopName} posted a new offer`,
        body,
        shopUid,
        offerId,
        read: false,
        at: FieldValue.serverTimestamp(),
      }, { merge: true })
    }
    await batch.commit()
    notified += Math.min(BATCH_LIMIT, followerUids.length - i)
  }

  // 3. Web push — collect every live token, multicast, prune the dead.
  const tokenRefs = []
  for (const cid of followerUids) {
    try {
      const tokensSnap = await db()
        .collection('fcmTokens').doc(cid)
        .collection('tokens')
        .get()
      for (const tokenDoc of tokensSnap.docs) tokenRefs.push(tokenDoc.ref)
    } catch (err) {
      console.error('notify-followers: token read failed for', cid, err)
    }
  }

  let sent = 0
  let failed = 0
  let pruned = 0
  for (let i = 0; i < tokenRefs.length; i += MULTICAST_LIMIT) {
    const chunk = tokenRefs.slice(i, i + MULTICAST_LIMIT)
    try {
      const result = await getMessaging().sendEachForMulticast({
        tokens: chunk.map((ref) => ref.id),
        notification: { title: shopName, body },
        data: {
          type: 'new-offer',
          shopUid,
          offerId,
          url: offerUrl,
        },
        // No webpush.fcmOptions.link — the service worker's notificationclick
        // handler opens the offer (self.location.origin + data.url), so the
        // push behaves the same on previews and production.
      })
      sent += result.successCount
      failed += result.failureCount
      const dead = result.responses
        .map((response, index) => ({ response, ref: chunk[index] }))
        .filter(({ response }) => {
          const code = response.error?.code ?? ''
          return (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/invalid-argument'
          )
        })
      if (dead.length > 0) {
        const batch = db().batch()
        for (const { ref } of dead) batch.delete(ref)
        await batch.commit()
        pruned += dead.length
      }
    } catch (err) {
      console.error('notify-followers: multicast failed:', err)
      failed += chunk.length
    }
  }

  return sendJson(res, 200, {
    ok: true,
    followers: followerUids.length,
    notified,
    sent,
    failed,
    pruned,
  })
}
