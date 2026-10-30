/** The public feed mirror — how customers see offers at all.
    Firestore keeps shops and offers private (owner or admin only), so the
    customer app cannot read a single offer. This layer maintains `feed/`,
    a top-level collection of public-safe mirrors: one doc per offer that a
    customer may currently see, written by the owning merchant (or an admin)
    whenever the offer or the shop's public state changes. Rules make feed
    world-readable; writes stay owner-or-admin.

    A mirror exists only while it should be findable:
    - shop verified and subscription not lapsed (holiday mode keeps the doc
      with `shopPaused: true` so the landing can say "offers are paused")
    - offer status is one of live / scheduled / ended / paused — draft,
      review and changes offers have no mirror at all
    Display state (live vs scheduled vs ended) is derived from the copied
    dates at read time, so a scheduled offer goes live with no write.

    The mirror carries marketing fields only: names, category, photos, the
    deal, terms, dates and the pin coordinates. No phones, no owner names,
    no GSTIN, no review notes. Views are counted in shops/{uid}/views (see
    shop.ts), not here, so the merchant's syncs never touch counters. */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import { feeExpired, type OfferRecord, type ShopRecord } from './shop'

/** The public projection of one offer. Field-for-field the subset of the
    shop + offer docs a customer is allowed to see. */
export type FeedRecord = {
  shopUid: string
  offerId: string
  shopName: string
  shopCategory?: string
  shopPhotoUrl?: string
  /** Pin position from the shop's map step — powers distance, radius
      filtering and the customer map's pins. Absent when the shop never
      set one. */
  lat?: number
  lng?: number
  title?: string
  discountLabel?: string
  tileColor?: 'yellow' | 'red' | 'pink' | 'green'
  description?: string
  photos?: string[]
  startsAt?: string
  endsAt?: string
  /** The offer doc's own status at sync time — one of the four mirrored
      values. Live-vs-scheduled-vs-ended is derived from the dates. */
  status: 'live' | 'scheduled' | 'ended' | 'paused'
  minBill?: number
  inStoreOnly?: boolean
  newCustomersOnly?: boolean
  exclusions?: string[]
  redeemKind?: 'screen' | 'code' | 'coupon' | 'custom'
  redeemCode?: string
  redeemCustom?: string
  /** The shop's holiday switch at sync time — the doc stays, the flag
      hides it from the feed and explains the landing. */
  shopPaused?: boolean
  /** The shop's paid-year end at sync time — read-time expiry means a
      lapsed subscription goes dark without anyone re-syncing. */
  feeExpiresAt?: string
  updatedAt?: import('firebase/firestore').Timestamp
}

/** Doc id for one offer's mirror — stable, so re-syncs overwrite in place. */
export function feedId(shopUid: string, offerId: string): string {
  return `${shopUid}_${offerId}`
}

/** Statuses a mirror may hold — everything else (draft, review, changes)
    is internal and never leaves the shop's own documents. */
const MIRROR_STATUSES = ['live', 'scheduled', 'ended', 'paused'] as const

/** Builds the mirror body. Only set fields are written — Firestore rejects
    undefined, and an absent field means "the merchant never set this". */
function mirrorData(
  shopUid: string,
  shop: ShopRecord,
  offer: OfferRecord,
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    shopUid,
    offerId: offer.id,
    shopName: shop.name,
    status: offer.status ?? 'live',
    shopPaused: shop.holidayMode === true,
    updatedAt: serverTimestamp(),
  }
  if (shop.category) data.shopCategory = shop.category
  if (shop.shopPhotoUrl) data.shopPhotoUrl = shop.shopPhotoUrl
  if (typeof shop.lat === 'number' && typeof shop.lng === 'number') {
    data.lat = shop.lat
    data.lng = shop.lng
  }
  if (offer.title) data.title = offer.title
  if (offer.discountLabel) data.discountLabel = offer.discountLabel
  if (offer.tileColor) data.tileColor = offer.tileColor
  if (offer.description) data.description = offer.description
  if (offer.photos && offer.photos.length > 0) data.photos = offer.photos
  if (offer.startsAt) data.startsAt = offer.startsAt
  if (offer.endsAt) data.endsAt = offer.endsAt
  if (typeof offer.minBill === 'number' && offer.minBill > 0) {
    data.minBill = offer.minBill
  }
  if (offer.inStoreOnly) data.inStoreOnly = true
  if (offer.newCustomersOnly) data.newCustomersOnly = true
  if (offer.exclusions && offer.exclusions.length > 0) {
    data.exclusions = offer.exclusions
  }
  if (offer.redeemKind) data.redeemKind = offer.redeemKind
  if (offer.redeemCode) data.redeemCode = offer.redeemCode
  if (offer.redeemCustom) data.redeemCustom = offer.redeemCustom
  if (shop.feeExpiresAt) data.feeExpiresAt = shop.feeExpiresAt
  return data
}

/** Writes or removes one offer's mirror to match the shop + offer state.
    The heart of the mirror: every sync path funnels through here. */
export async function syncOfferFeed(
  shopUid: string,
  shop: ShopRecord,
  offer: OfferRecord,
): Promise<void> {
  const ref = doc(db, 'feed', feedId(shopUid, offer.id))
  const status = offer.status ?? 'live'
  // Unverified or lapsed shops go dark entirely; holiday mode stays
  // mirrored with the flag set (the landing explains the pause).
  if (
    !MIRROR_STATUSES.includes(status as (typeof MIRROR_STATUSES)[number]) ||
    shop.verification !== 'verified' ||
    feeExpired(shop)
  ) {
    await deleteDoc(ref)
    return
  }
  await setDoc(ref, mirrorData(shopUid, shop, offer))
}

/** Re-syncs one offer from the current shop + offer docs — the hook the
    status transitions and the builder call after their own writes. */
export async function syncOffer(
  shopUid: string,
  offerId: string,
): Promise<void> {
  const [shopSnap, offerSnap] = await Promise.all([
    getDoc(doc(db, 'shops', shopUid)),
    getDoc(doc(db, 'shops', shopUid, 'offers', offerId)),
  ])
  const ref = doc(db, 'feed', feedId(shopUid, offerId))
  if (!shopSnap.exists() || !offerSnap.exists()) {
    await deleteDoc(ref)
    return
  }
  await syncOfferFeed(
    shopUid,
    shopSnap.data() as ShopRecord,
    { id: offerSnap.id, ...offerSnap.data() } as OfferRecord,
  )
}

/** Re-syncs every mirror a shop owns — the hook for shop-level changes
    (verification, holiday mode, renewal, profile edits). Reads the shop
    and its offers, then rewrites each mirror through the same gate. */
export async function syncShopFeed(shopUid: string): Promise<void> {
  const [shopSnap, offersSnap] = await Promise.all([
    getDoc(doc(db, 'shops', shopUid)),
    getDocs(collection(db, 'shops', shopUid, 'offers')),
  ])
  if (!shopSnap.exists()) return
  const shop = shopSnap.data() as ShopRecord
  await Promise.all(
    offersSnap.docs.map((entry) =>
      syncOfferFeed(
        shopUid,
        shop,
        { id: entry.id, ...entry.data() } as OfferRecord,
      ),
    ),
  )
}

/** Removes one offer's mirror — the deleteOffer hook. Deleting a missing
    doc is a no-op, so this is safe to call unconditionally. */
export async function removeOfferFeed(
  shopUid: string,
  offerId: string,
): Promise<void> {
  await deleteDoc(doc(db, 'feed', feedId(shopUid, offerId)))
}

/** Live subscription to the whole public feed — the customer screens'
    data source. Small collection, so the client filters (radius, dates,
    shop state) in memory. Failed streams retry with backoff, same
    contract as watchOffers; onError fires when the retries give up. */
export function watchFeed(
  onData: (items: FeedRecord[]) => void,
  onError?: (message: string) => void,
): () => void {
  let unsub: (() => void) | null = null
  let attempts = 0
  let closed = false

  const subscribe = () => {
    if (closed) return
    unsub = onSnapshot(
      collection(db, 'feed'),
      (snap) => {
        attempts = 0
        onData(snap.docs.map((entry) => entry.data() as FeedRecord))
      },
      (err) => {
        console.error('watchFeed', err)
        unsub?.()
        attempts += 1
        if (attempts <= 8) {
          setTimeout(subscribe, Math.min(1000 * 2 ** attempts, 20000))
          return
        }
        onError?.(err instanceof Error ? err.message : String(err))
      },
    )
  }
  subscribe()

  return () => {
    closed = true
    unsub?.()
  }
}

/** One-time mirror read for the shared-link landing — the public twin of
    fetchOffer. Null when no mirror exists (dead link, unverified or
    lapsed shop, internal offer status). */
export async function fetchFeedOffer(
  shopUid: string,
  offerId: string,
): Promise<FeedRecord | null> {
  const snap = await getDoc(doc(db, 'feed', feedId(shopUid, offerId)))
  return snap.exists() ? (snap.data() as FeedRecord) : null
}

/** The display status a mirror should carry right now, judged by its own
    window — the read-time twin of approvedStatus(). Paused stays paused;
    everything else derives from the copied dates. */
export function feedDisplayStatus(item: FeedRecord): 'live' | 'scheduled' | 'ended' | 'paused' {
  if (item.status === 'paused') return 'paused'
  const now = Date.now()
  const end = item.endsAt ? Date.parse(item.endsAt) : NaN
  const start = item.startsAt ? Date.parse(item.startsAt) : NaN
  if (Number.isFinite(end) && end < now) return 'ended'
  if (Number.isFinite(start) && start > now) return 'scheduled'
  return 'live'
}

/** Whether a mirror's shop subscription has lapsed — read-time, so the
    expiry bites on the copy without waiting for a re-sync. */
export function feedFeeLapsed(item: FeedRecord): boolean {
  return Boolean(item.feeExpiresAt && item.feeExpiresAt <= new Date().toISOString())
}
