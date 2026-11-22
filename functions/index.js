/**
 * Firebase Cloud Functions for NearZoop.
 *
 * `revalidateOffers` runs every 15 minutes and checks the customer-facing
 * offer mirrors in `feed/`: a public status, an active subscription, a shop
 * that is open, a title and a way to redeem. Each mirror gets a genuine
 * `lastCheckedAt` stamp plus the result — the customer offer page reads that
 * stamp, so "checked 12 min ago" is an actual check, not a mirror sync time.
 *
 * The job never changes visibility: read-time derivation handles
 * scheduled/ended offers, and the merchant's sync handles removals.
 */
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onDocumentCreated } = require('firebase-functions/v2/firestore')
const { defineSecret } = require('firebase-functions/params')
const { Resend } = require('resend')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { notificationEmail } = require('./emailTemplate')

initializeApp()

const resendKey = defineSecret('RESEND_API_KEY')
const resendFrom = defineSecret('RESEND_FROM_EMAIL')
const resendUpdatesFrom = defineSecret('RESEND_UPDATES_FROM')

const MIRROR_STATUSES = ['live', 'scheduled', 'ended', 'paused']
const BATCH_LIMIT = 400

/** The display status a mirror has right now — server twin of the client's
 *  feedDisplayStatus() (this package cannot import src/). */
function displayStatus(data, nowMs) {
  if (data.status === 'paused') return 'paused'
  const end = data.endsAt ? Date.parse(data.endsAt) : NaN
  const start = data.startsAt ? Date.parse(data.startsAt) : NaN
  if (Number.isFinite(end) && end < nowMs) return 'ended'
  if (Number.isFinite(start) && start > nowMs) return 'scheduled'
  return 'live'
}

/** Checks one mirror for problems a customer would run into. Normal lifecycle
 *  states (scheduled, ended) are recorded as `displayStatus`, not failures. */
function checkOffer(data, nowMs = Date.now()) {
  const issues = []

  if (!MIRROR_STATUSES.includes(data.status)) issues.push('unsupported status')
  if (data.shopPaused) issues.push('shop paused')
  if (data.feeExpiresAt && data.feeExpiresAt <= new Date(nowMs).toISOString()) {
    issues.push('subscription lapsed')
  }
  if (!String(data.title ?? '').trim()) issues.push('missing title')

  const kind = data.redeemKind
  if (
    kind === 'code' ? !String(data.redeemCode ?? '').trim()
    : kind === 'custom' ? !String(data.redeemCustom ?? '').trim()
    : kind && kind !== 'screen' && kind !== 'coupon'
  ) {
    issues.push('missing redemption path')
  }

  return { ok: issues.length === 0, issues, displayStatus: displayStatus(data, nowMs) }
}

exports.revalidateOffers = onSchedule(
  { schedule: 'every 15 minutes', region: 'asia-south1' },
  async () => {
    const firestore = getFirestore()
    const snap = await firestore.collection('feed').get()
    const nowMs = Date.now()
    let healthy = 0
    const flagged = []
    let batch = firestore.batch()
    let pending = 0

    for (const doc of snap.docs) {
      const result = checkOffer(doc.data(), nowMs)
      if (result.ok) healthy += 1
      else flagged.push({ id: doc.id, issues: result.issues })

      batch.update(doc.ref, {
        lastCheckedAt: FieldValue.serverTimestamp(),
        checkOk: result.ok,
        checkStatus: result.displayStatus,
        checkIssues: result.issues,
      })
      pending += 1
      if (pending === BATCH_LIMIT) {
        await batch.commit()
        batch = firestore.batch()
        pending = 0
      }
    }
    if (pending > 0) await batch.commit()

    console.log(
      `revalidateOffers: checked ${snap.size} mirrors, ${healthy} healthy, ` +
        `${flagged.length} flagged`,
      flagged.slice(0, 20),
    )
  },
)

/**
 * Every business notification gets a NearZoop-themed email at the verified
 * merchant address. One onCreate trigger covers all writers (approvals,
 * verification verdicts, customer reports, removals). A marker doc makes the
 * trigger idempotent — Firestore can redeliver events.
 */
exports.emailBusinessNotification = onDocumentCreated(
  {
    document: 'shops/{shopUid}/notifications/{notificationId}',
    region: 'asia-south1',
    secrets: [resendKey, resendFrom, resendUpdatesFrom],
  },
  async (event) => {
    const snapshot = event.data
    if (!snapshot) return
    const notification = snapshot.data()
    const { shopUid, notificationId } = event.params
    const firestore = getFirestore()

    const markerRef = firestore
      .collection('shops')
      .doc(shopUid)
      .collection('notificationEmails')
      .doc(notificationId)
    // Already handled on a previous delivery — do not email twice.
    if ((await markerRef.get()).exists) return

    const [userSnap, shopSnap] = await Promise.all([
      firestore.collection('users').doc(shopUid).get(),
      firestore.collection('shops').doc(shopUid).get(),
    ])
    const email = userSnap.get('email')
    if (!email || userSnap.get('emailVerified') !== true) {
      console.log(`notificationEmail: ${shopUid} has no verified email — skipping`)
      return
    }

    const mail = notificationEmail({
      title: notification.title,
      body: notification.body,
      kind: notification.kind,
      shopName: shopSnap.get('name'),
      url: 'https://nearzoop.teamobliq.in/business/notifications',
    })

    const result = await new Resend(resendKey.value()).emails.send({
      from:
        resendUpdatesFrom.value() ||
        resendFrom.value() ||
        'NearZoop Updates <onboarding@resend.dev>',
      to: [email],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    })
    if (result.error) throw new Error(result.error.message || 'Resend rejected the email')

    await markerRef.set({
      sentAt: FieldValue.serverTimestamp(),
      to: email,
      kind: notification.kind || 'unknown',
    })
    console.log(`notificationEmail: sent ${notification.kind} to ${shopUid}`)
  },
)
