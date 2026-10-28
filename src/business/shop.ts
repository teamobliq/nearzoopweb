/** Shop profile + offers data layer (Firestore).
    One doc per merchant: shops/{uid}. Offers live in shops/{uid}/offers.
    The wizard saves progress after every step: `setupStep` records the last
    completed step and `setupDone` flips only on the final submit, so the
    /busdash checker can resume an unfinished setup at the right screen. */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'

export type DocKind = 'gstin' | 'licence' | 'udyam' | 'signboard'

/** One day group's hours: a window, explicitly closed, or not set yet.
    Times are "HH:mm" (24h) as produced by <input type="time">. */
export type DayHours = { opens: string; closes: string } | 'closed' | null

/** The two day groups the wizard collects — one window for Mon–Sat, one for
    Sunday. Null fields mean the merchant never set them (nothing is written
    to Firestore until at least one group has a value). */
export type OpeningHours = {
  monSat: DayHours
  sunday: DayHours
}

/** What the setup wizard collects, step by step. */
export type ShopDraft = {
  name: string
  category: string
  ownerName: string
  customerPhone: string
  showPhone: boolean
  address: string
  /** Pin position from the map step — powers "near me" queries later. */
  lat?: number
  lng?: number
  openingHours?: OpeningHours | null
  /** Holiday switch — temporarily hides the shop's offers from customers. */
  holidayMode?: boolean
  shopPhotoUrl: string | null
  docKind: DocKind
  gstin: string
  /** Legal name the GST network returned for `gstin` — set when the GSTIN
      was auto-verified at submit time. */
  gstinLegalName?: string
  docPhotoUrl: string | null
}

/** A partial write: any subset of the draft plus wizard progress markers. */
export type ShopPatch = Partial<ShopDraft> & {
  setupStep?: 0 | 1 | 2
  setupDone?: boolean
  verification?: Verification
  /** One-time ₹1,000 Razorpay verification fee — settled flag + reference. */
  paymentDone?: boolean
  paymentId?: string
  /** Admin's rejection reason, shown on the merchant's failed screen. */
  reviewNote?: string
}

export type Verification = 'pending' | 'verified' | 'failed'

export type ShopRecord = ShopDraft & {
  setupStep?: 0 | 1 | 2
  setupDone?: boolean
  verification: Verification
  paymentDone?: boolean
  paymentId?: string
  /** Admin's rejection reason, shown on the merchant's failed screen. */
  reviewNote?: string
  /** Server write time of the last save (set by saveShop). */
  updatedAt?: Timestamp
}

/** Merges a partial write into the merchant's shop doc (creates it if needed). */
export async function saveShop(uid: string, patch: ShopPatch): Promise<void> {
  await setDoc(
    doc(db, 'shops', uid),
    { ...patch, updatedAt: serverTimestamp() },
    { merge: true },
  )
}

/** Reads one shop doc. Both call sites are routing decisions (boot check and
    post-OTP), so this reads straight from the server: the local cache can
    hold a stale "doc missing" entry from a pre-setup sign-in, which would
    silently route a finished merchant into the setup wizard. Offline this
    throws (unreachable) instead of serving the cache — the callers show a
    reload prompt for that, which is the right outcome anyway. */
export async function fetchShop(uid: string): Promise<ShopRecord | null> {
  const snap = await getDoc(doc(db, 'shops', uid), { source: 'server' })
  return snap.exists() ? (snap.data() as ShopRecord) : null
}

/** One-time offer read for deep links — a shared-link landing needs the
    offer, not a live subscription. Null when the link is dead. */
export async function fetchOffer(
  uid: string,
  offerId: string,
): Promise<OfferRecord | null> {
  const snap = await getDoc(doc(db, 'shops', uid, 'offers', offerId))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as OfferRecord) : null
}

/** Bucket keys for the insights ranges — local time of the device doing
    the counting. Days are "2026-10-28"; hours are "Mon-18" (weekday +
    24h hour) so the insights chart can name a busiest slot like
    "Mon 6–7 PM". Dashes are safe in Firestore field paths. */
function dayKey(at = new Date()): string {
  const year = at.getFullYear()
  const month = String(at.getMonth() + 1).padStart(2, '0')
  const day = String(at.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function hourKey(at = new Date()): string {
  return `${WEEKDAYS[at.getDay()]}-${at.getHours()}`
}

/** Counts a deep-link view. Fire-and-forget: a failed counter must never
    break the visitor's screen. Writes the lifetime counter plus day and
    weekday-hour buckets so the insights ranges are true from day one. */
export function countOfferView(uid: string, offerId: string): void {
  const now = new Date()
  updateDoc(doc(db, 'shops', uid, 'offers', offerId), {
    views: increment(1),
    [`viewDays.${dayKey(now)}`]: increment(1),
    [`viewHours.${hourKey(now)}`]: increment(1),
  }).catch(() => {})
}

/** Counts a save, with the same day bucketing as views. Nothing calls this
    until the customer app exists — shipped now so the insights "Saved"
    row is range-correct from the very first save. */
export function countOfferSave(uid: string, offerId: string): void {
  updateDoc(doc(db, 'shops', uid, 'offers', offerId), {
    saves: increment(1),
    [`saveDays.${dayKey()}`]: increment(1),
  }).catch(() => {})
}

/** Manual redemption counting — the scan flow's "Mark 1 redeemed" path.
    Counter-only on purpose: no per-redemption log exists yet. Day buckets
    ride along so the insights ranges include redemptions. */
export async function markOfferRedeemed(
  uid: string,
  offerId: string,
): Promise<void> {
  await updateDoc(doc(db, 'shops', uid, 'offers', offerId), {
    redemptions: increment(1),
    [`redeemDays.${dayKey()}`]: increment(1),
  })
}

/** Reverses a just-marked redemption — the scan flow's undo window. */
export async function unmarkOfferRedeemed(
  uid: string,
  offerId: string,
): Promise<void> {
  await updateDoc(doc(db, 'shops', uid, 'offers', offerId), {
    redemptions: increment(-1),
    [`redeemDays.${dayKey()}`]: increment(-1),
  })
}

/* ---- Customer reports ----
   Filed by visitors from a shared offer link (often signed out — the rules
   allow anonymous creates for exactly this), resolved by the shop. */

export type ShopReport = {
  id: string
  offerId: string
  offerTitle?: string
  reason: string
  note?: string
  status: 'open' | 'resolved'
  /** The merchant's chosen reply, recorded when they respond. */
  response?: string
  responseNote?: string
  respondedAt?: Timestamp
  createdAt?: Timestamp
}

export const REPORT_REASONS = [
  'Offer has expired or ended early',
  'Terms are misleading',
  'Shop didn’t honour it',
  'Wrong business info (address, hours)',
  'Duplicate listing',
  'Looks suspicious or fake',
] as const

/** The merchant's fixed reply options on a report — the design's three. */
export const REPORT_RESPONSES = [
  'We’ve briefed staff — it’ll work now',
  'The bill didn’t meet the terms',
  'Something else',
] as const

/** Files a customer report AND drops a "New customer report" notification
    into the shop's inbox in one atomic batch. The notification reuses the
    report's doc id so the rules can verify the pair (see firestore.rules);
    its body is derived from the report, so a report can never carry free
    text into the inbox beyond what the report itself holds. */
export async function saveReport(
  uid: string,
  report: {
    offerId: string
    offerTitle?: string
    reason: string
    note?: string
  },
): Promise<void> {
  const offerTitle = report.offerTitle?.trim() || 'Untitled offer'
  const reason = report.reason
  const reportRef = doc(collection(db, 'shops', uid, 'reports'))
  const batch = writeBatch(db)
  batch.set(reportRef, {
    offerId: report.offerId,
    offerTitle,
    reason,
    note: report.note?.trim() || '',
    status: 'open',
    createdAt: serverTimestamp(),
  })
  batch.set(doc(db, 'shops', uid, 'notifications', reportRef.id), {
    kind: 'report',
    title: 'New customer report',
    body: `${reason} · ${offerTitle}`,
    at: serverTimestamp(),
    read: false,
  })
  await batch.commit()
}

export function watchShopReports(
  uid: string,
  onChange: (reports: ShopReport[]) => void,
): () => void {
  return onSnapshot(collection(db, 'shops', uid, 'reports'), (snap) => {
    const reports = snap.docs.map((entry) => ({
      id: entry.id,
      ...(entry.data() as Omit<ShopReport, 'id'>),
    }))
    reports.sort(
      (a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
    )
    onChange(reports)
  })
}

/** The merchant responds to a report — records their chosen reply plus an
    optional note to NearZoop, and resolves the report in the same write.
    The customer is never messaged back; the response is a record for the
    shop and for NearZoop's review. */
export async function respondToReport(
  uid: string,
  reportId: string,
  response: string,
  responseNote = '',
): Promise<void> {
  await updateDoc(doc(db, 'shops', uid, 'reports', reportId), {
    status: 'resolved',
    response,
    responseNote: responseNote.trim(),
    respondedAt: serverTimestamp(),
  })
}

/* ---- Notifications ----
   The shop's inbox. Admin verdicts (verification, offer review) write here
   in the same batch as the verdict itself; the merchant reads and marks
   rows read. */

export type ShopNotification = {
  id: string
  kind:
    | 'verified'
    | 'verification-failed'
    | 'offer-approved'
    | 'offer-changes'
    | 'offer-removed'
    | 'report'
  title: string
  body?: string
  at?: Timestamp
  read?: boolean
}

export function watchShopNotifications(
  uid: string,
  onChange: (notifications: ShopNotification[]) => void,
): () => void {
  return onSnapshot(
    collection(db, 'shops', uid, 'notifications'),
    (snap) => {
      const items = snap.docs.map((entry) => ({
        id: entry.id,
        ...(entry.data() as Omit<ShopNotification, 'id'>),
      }))
      items.sort(
        (a, b) => (b.at?.toMillis() ?? 0) - (a.at?.toMillis() ?? 0),
      )
      onChange(items)
    },
  )
}

/** Marks the given notifications read — the Notifications screen does this
    once on open, so the bell count resets without nagging. */
export async function markNotificationsRead(
  uid: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return
  const batch = writeBatch(db)
  for (const id of ids) {
    batch.update(doc(db, 'shops', uid, 'notifications', id), { read: true })
  }
  await batch.commit()
}

/** Live subscription to the shop doc — verification status flips here. */
export function watchShop(
  uid: string,
  onChange: (shop: ShopRecord | null) => void,
): () => void {
  return onSnapshot(
    doc(db, 'shops', uid),
    (snap) => {
      onChange(snap.exists() ? (snap.data() as ShopRecord) : null)
    },
    () => onChange(null),
  )
}

/** Lifecycle of an offer, from the offers-list design: work-in-progress
    states (draft → review → changes / scheduled) through live → ended. */
export type OfferStatus =
  | 'draft'
  | 'scheduled'
  | 'review'
  | 'changes'
  | 'live'
  | 'paused'
  | 'ended'

/** What the offer is worth — drives the list tile's colour and headline. */
export type OfferDealKind = 'percent' | 'flat' | 'bogo' | 'free' | 'special'

/** How a customer proves the offer at the counter. */
export type OfferRedeemKind = 'screen' | 'code' | 'coupon' | 'custom'

/** One offer as stored by the offer builder. Stat fields are optional until
    redemptions happen — the dashboard renders honest zeros. */
export type OfferRecord = {
  id: string
  title?: string
  discountLabel?: string
  /** Tile look on list screens; the builder picks it, lists fall back. */
  tileColor?: 'yellow' | 'red' | 'pink' | 'green'
  /** Human reference shown on the sent screen ("B-20931"). */
  ref?: string
  dealKind?: OfferDealKind
  dealValue?: string
  dealScope?: string
  description?: string
  photos?: string[]
  redeemKind?: OfferRedeemKind
  redeemCode?: string
  redeemCustom?: string
  /** ISO stamps ("2026-10-24T05:00:00.000Z") — lists format for display. */
  startsAt?: string
  endsAt?: string
  status?: OfferStatus
  /** Terms — absent fields mean the merchant set nothing. */
  minBill?: number
  inStoreOnly?: boolean
  newCustomersOnly?: boolean
  /** One exclusion per entry, shown verbatim to customers. */
  exclusions?: string[]
  radiusKm?: number
  views?: number
  saves?: number
  directions?: number
  redemptions?: number
  /** Insights buckets, written alongside the lifetime counters. Days are
      "2026-10-28"; hours are "Mon-18" (weekday + 24h hour). */
  viewDays?: Record<string, number>
  viewHours?: Record<string, number>
  saveDays?: Record<string, number>
  redeemDays?: Record<string, number>
  reviewNote?: string
  /** Optional "try something like" suggestion shown under the note. */
  reviewFix?: string
  /** ISO stamps written by the builder; lists render them relative
      ("2 h ago"). */
  submittedAt?: string
  updatedAt?: string
  createdAt?: string
}

/** Tile colour for a deal kind — the same mapping the list screens use. */
export function offerTileColor(
  kind: OfferDealKind,
): 'yellow' | 'red' | 'pink' | 'green' {
  switch (kind) {
    case 'flat':
      return 'red'
    case 'free':
      return 'green'
    case 'bogo':
    case 'special':
      return 'pink'
    default:
      return 'yellow'
  }
}

/** The list tile's headline: "15% OFF" prints big "15%" over small "OFF". */
export function offerDiscountLabel(
  kind: OfferDealKind,
  value: string,
  scope: string,
): string {
  switch (kind) {
    case 'percent':
      return `${value}% OFF`
    case 'flat':
      return `₹${value} OFF`
    case 'special':
      return scope ? `₹${value} ${scope}` : `₹${value}`
    case 'free':
      return value ? `FREE ${value}` : 'FREE'
    case 'bogo':
      return value ? `BOGO ${value}` : 'BOGO'
  }
}

/** Everything the builder writes — stat fields belong to the runtime. */
export type OfferWrite = Omit<
  OfferRecord,
  'id' | 'views' | 'saves' | 'directions' | 'redemptions'
>

/** Creates an offer doc (draft or submitted) and returns its id. All field
    values must be defined — Firestore rejects undefined. */
export async function saveOffer(uid: string, offer: OfferWrite): Promise<string> {
  const created = await addDoc(collection(db, 'shops', uid, 'offers'), offer)
  return created.id
}

/** Live subscription to the merchant's offers. A failed stream (rules
    deployed mid-session, network blip) stays dead forever unless retried —
    so retry with backoff instead of silently showing an empty list. */
export function watchOffers(
  uid: string,
  onChange: (offers: OfferRecord[]) => void,
): () => void {
  let unsub: (() => void) | null = null
  let attempts = 0
  let closed = false

  const subscribe = () => {
    if (closed) return
    unsub = onSnapshot(
      collection(db, 'shops', uid, 'offers'),
      (snap) => {
        attempts = 0
        const offers = snap.docs.map((entry) => ({
          id: entry.id,
          ...(entry.data() as Omit<OfferRecord, 'id'>),
        }))
        // Newest first — ISO strings sort lexicographically.
        offers.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
        onChange(offers)
      },
      (err) => {
        console.error('watchOffers', err)
        unsub?.()
        attempts += 1
        if (attempts <= 8) {
          setTimeout(subscribe, Math.min(1000 * 2 ** attempts, 20000))
        }
      },
    )
  }
  subscribe()

  return () => {
    closed = true
    unsub?.()
  }
}

/** The status an approved offer should carry right now, judged by its own
    window: already finished ends, not started yet schedules, otherwise live. */
export function approvedStatus(offer: OfferRecord): OfferStatus {
  const now = Date.now()
  const end = offer.endsAt ? Date.parse(offer.endsAt) : NaN
  const start = offer.startsAt ? Date.parse(offer.startsAt) : NaN
  if (Number.isFinite(end) && end < now) return 'ended'
  if (Number.isFinite(start) && start > now) return 'scheduled'
  return 'live'
}

/** Admin verdict on a submitted offer. An empty reviewNote clears any
    earlier note; reviewFix carries the optional "try something like"
    suggestion shown under it. */
export async function setOfferStatus(
  uid: string,
  offerId: string,
  status: OfferStatus,
  reviewNote = '',
  reviewFix = '',
  offerTitle?: string,
  notify = false,
): Promise<void> {
  // Admin verdicts that push work back to the merchant also drop a
  // notification into the shop's inbox — one batch, all-or-nothing.
  // Merchant-side transitions (pause, resume, end) pass through the same
  // function but never notify anyone of their own action.
  const offerRef = doc(db, 'shops', uid, 'offers', offerId)
  const batch = writeBatch(db)
  batch.set(
    offerRef,
    { status, reviewNote, reviewFix, updatedAt: new Date().toISOString() },
    { merge: true },
  )
  if (status === 'changes') {
    const name = offerTitle ?? 'Your offer'
    batch.set(doc(collection(db, 'shops', uid, 'notifications')), {
      kind: 'offer-changes',
      title: `“${name}” needs changes`,
      body: [
        reviewNote || 'The review team left a note on this offer.',
        reviewFix ? `Try something like: ${reviewFix}` : '',
      ]
        .filter(Boolean)
        .join(' '),
      at: serverTimestamp(),
      read: false,
    })
  }
  // Approvals notify only when they come from the review team (notify is
  // false for the merchant's own resume — nobody needs a notification
  // about their own tap), and only when the offer actually went live.
  if (notify && status === 'live') {
    const name = offerTitle ?? 'Your offer'
    batch.set(doc(collection(db, 'shops', uid, 'notifications')), {
      kind: 'offer-approved',
      title: 'Offer approved',
      body: `“${name}” is live.`,
      at: serverTimestamp(),
      read: false,
    })
  }
  await batch.commit()
}

/** One row of the admin panel's shops feed: the uid (doc id) plus the record. */
export type AdminShopEntry = {
  uid: string
  shop: ShopRecord
}

/** Live feed of every shop doc, most recently active first. Admin only.
    Failed streams retry with backoff — a dead stream never revives alone.
    onError receives the failure message (null on success) so the UI can
    show what is wrong instead of spinning forever. */
export function watchAllShops(
  onChange: (shops: AdminShopEntry[]) => void,
  onError?: (message: string | null) => void,
): () => void {
  let unsub: (() => void) | null = null
  let attempts = 0
  let closed = false

  const subscribe = () => {
    if (closed) return
    unsub = onSnapshot(
      collection(db, 'shops'),
      (snap) => {
        attempts = 0
        onError?.(null)
        const shops = snap.docs.map((entry) => ({
          uid: entry.id,
          shop: entry.data() as ShopRecord,
        }))
        shops.sort(
          (a, b) =>
            (b.shop.updatedAt?.toMillis() ?? 0) -
            (a.shop.updatedAt?.toMillis() ?? 0),
        )
        onChange(shops)
      },
      (err) => {
        console.error('watchAllShops', err)
        onError?.(err instanceof Error ? err.message : String(err))
        unsub?.()
        attempts += 1
        if (attempts <= 8) {
          setTimeout(subscribe, Math.min(1000 * 2 ** attempts, 20000))
        }
      },
    )
  }
  subscribe()

  return () => {
    closed = true
    unsub?.()
  }
}

/** Admin action: set a shop's verification verdict. `reviewNote` travels to
    the merchant's failed screen; verifying clears any stale note. Both
    verdicts drop a notification into the shop's inbox in the same batch. */
export async function setVerification(
  uid: string,
  verification: Exclude<Verification, 'pending'>,
  reviewNote = '',
): Promise<void> {
  const batch = writeBatch(db)
  batch.set(
    doc(db, 'shops', uid),
    { verification, reviewNote, updatedAt: serverTimestamp() },
    { merge: true },
  )
  batch.set(doc(collection(db, 'shops', uid, 'notifications')), {
    kind: verification === 'verified' ? 'verified' : 'verification-failed',
    title:
      verification === 'verified'
        ? 'Your shop is verified'
        : 'Verification needs attention',
    body:
      verification === 'verified'
        ? 'Customers will see the verified mark next to your shop.'
        : reviewNote ||
          'The verification team sent your shop back. Check the shop page for what to fix.',
    at: serverTimestamp(),
    read: false,
  })
  await batch.commit()
}

/** One row of the admin panel's offers feed: the owning shop's uid + offer. */
export type AdminOfferEntry = {
  shopUid: string
  offer: OfferRecord
}

/** Permanently removes one offer. The merchant's own delete passes no
    options — a plain delete. Admin removals pass `notify: true` so the
    merchant gets a notification telling them which offer went. */
export async function deleteOffer(
  shopUid: string,
  offerId: string,
  options: { title?: string; notify?: boolean } = {},
): Promise<void> {
  if (!options.notify) {
    await deleteDoc(doc(db, 'shops', shopUid, 'offers', offerId))
    return
  }
  const batch = writeBatch(db)
  batch.delete(doc(db, 'shops', shopUid, 'offers', offerId))
  batch.set(doc(collection(db, 'shops', shopUid, 'notifications')), {
    kind: 'offer-removed',
    title: `“${options.title ?? 'Your offer'}” was removed`,
    body: 'Our team took this offer down. Reach out if you think that’s a mistake.',
    at: serverTimestamp(),
    read: false,
  })
  await batch.commit()
}

/** Live feed of one shop's offers — the admin subscribes per shop and the
    panel merges. Collection-group queries are gated by the broadest
    matching rule (the /{document=**} catch-all), which makes them fragile;
    scoped subcollection queries are not. Same retry + error-reporting
    contract as the other feeds. */
export function watchShopOffers(
  uid: string,
  onChange: (offers: OfferRecord[]) => void,
  onError?: (message: string | null) => void,
): () => void {
  let unsub: (() => void) | null = null
  let attempts = 0
  let closed = false

  const subscribe = () => {
    if (closed) return
    unsub = onSnapshot(
      collection(db, 'shops', uid, 'offers'),
      (snap) => {
        attempts = 0
        onError?.(null)
        const offers = snap.docs.map((entry) => ({
          id: entry.id,
          ...(entry.data() as Omit<OfferRecord, 'id'>),
        }))
        // Newest first — ISO strings sort lexicographically.
        offers.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
        onChange(offers)
      },
      (err) => {
        console.error('watchShopOffers', err)
        onError?.(err instanceof Error ? err.message : String(err))
        unsub?.()
        attempts += 1
        if (attempts <= 8) {
          setTimeout(subscribe, Math.min(1000 * 2 ** attempts, 20000))
        }
      },
    )
  }
  subscribe()

  return () => {
    closed = true
    unsub?.()
  }
}
