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
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

initializeApp()

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
