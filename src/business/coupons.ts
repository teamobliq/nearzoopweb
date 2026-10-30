import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase'

/** A claimed coupon — one document per code at `coupons/{code}`.

    The customer claim flow writes it, the customer's offer page reads it
    back by the code, and the merchant's scanner looks it up by the same
    code. The doc id IS the code so a scan is a single get, not a query.

    Everything the pass needs is copied at claim time on purpose: the offer
    can change or end later, and a claimed coupon must still say what it was
    worth and until when. */
export type CouponRecord = {
  code: string
  shopUid: string
  shopName: string
  offerId: string
  offerTitle: string
  discountLabel?: string
  customerUid: string
  /** ISO strings, matching the rest of the data model. */
  claimedAt: string
  endsAt: string | null
  usedAt: string | null
  usedBy: string | null
}

/** No 0/O or 1/I — the code is read off a phone and typed by hand when
    the camera can't scan. */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

function randomChunk(length: number): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length]
  return out
}

/** `NZ-7Q4K-29XB` — the shape the merchant scanner formats and expects. */
export function newCouponCode(): string {
  return `NZ-${randomChunk(4)}-${randomChunk(3)}`
}

/** "nz7q4k29xb", "NZ-7Q4K-29XB", "NZ 7Q4K 29XB" → `NZ-7Q4K-29XB`. */
export function fmtCouponCode(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const body = clean.startsWith('NZ') ? clean.slice(2) : clean
  if (body.length === 7) return `NZ-${body.slice(0, 4)}-${body.slice(4)}`
  return body ? `NZ-${body}` : '—'
}

function toRecord(code: string, data: Record<string, unknown>): CouponRecord {
  return {
    code,
    shopUid: String(data.shopUid ?? ''),
    shopName: String(data.shopName ?? ''),
    offerId: String(data.offerId ?? ''),
    offerTitle: String(data.offerTitle ?? ''),
    discountLabel:
      typeof data.discountLabel === 'string' ? data.discountLabel : undefined,
    customerUid: String(data.customerUid ?? ''),
    claimedAt: String(data.claimedAt ?? ''),
    endsAt: typeof data.endsAt === 'string' ? data.endsAt : null,
    usedAt: typeof data.usedAt === 'string' ? data.usedAt : null,
    usedBy: typeof data.usedBy === 'string' ? data.usedBy : null,
  }
}

/** Everything a claim copies from the offer at the moment of claiming. */
export type ClaimInput = {
  shopUid: string
  shopName: string
  offerId: string
  offerTitle: string
  discountLabel?: string
  endsAt?: string | null
  customerUid: string
}

/** Issues a single-use coupon. The doc is created inside a transaction so
    a code collision can never overwrite somebody else's coupon — the rare
    clash just draws a fresh code. */
export async function claimCoupon(input: ClaimInput): Promise<CouponRecord> {
  const now = new Date().toISOString()
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = newCouponCode()
    const ref = doc(db, 'coupons', code)
    const record: CouponRecord = {
      code,
      shopUid: input.shopUid,
      shopName: input.shopName,
      offerId: input.offerId,
      offerTitle: input.offerTitle,
      discountLabel: input.discountLabel,
      customerUid: input.customerUid,
      claimedAt: now,
      endsAt: input.endsAt ?? null,
      usedAt: null,
      usedBy: null,
    }
    let created = false
    try {
      created = await runTransaction(db, async (tx) => {
        const existing = await tx.get(ref)
        if (existing.exists()) return false
        tx.set(ref, {
          shopUid: record.shopUid,
          shopName: record.shopName,
          offerId: record.offerId,
          offerTitle: record.offerTitle,
          ...(record.discountLabel
            ? { discountLabel: record.discountLabel }
            : {}),
          customerUid: record.customerUid,
          claimedAt: record.claimedAt,
          endsAt: record.endsAt,
          usedAt: null,
          usedBy: null,
        })
        return true
      })
    } catch (error) {
      // A rules denial is final — retrying would just fail identically.
      throw error
    }
    if (created) return record
  }
  throw new Error('Could not allocate a coupon code')
}

/** The customer's live coupon for one offer, if they already claimed it. */
export async function findMyCoupon(
  customerUid: string,
  offerId: string,
): Promise<CouponRecord | null> {
  // Single-field query on purpose: no composite index to deploy. A customer
  // only ever has a handful of coupons, so filtering here is free.
  const snap = await getDocs(
    query(collection(db, 'coupons'), where('customerUid', '==', customerUid)),
  )
  for (const d of snap.docs) {
    const record = toRecord(d.id, d.data())
    if (record.offerId === offerId) return record
  }
  return null
}

/** All coupons a customer has claimed, newest first. Single-field query so no
    composite index is needed. */
export async function listMyCoupons(
  customerUid: string,
): Promise<CouponRecord[]> {
  const snap = await getDocs(
    query(collection(db, 'coupons'), where('customerUid', '==', customerUid)),
  )
  const records = snap.docs.map((d) => toRecord(d.id, d.data()))
  records.sort((a, b) => (a.claimedAt < b.claimedAt ? 1 : -1))
  return records
}

/** The scanner's single lookup seam — by code, or nothing. */
export async function lookupCoupon(code: string): Promise<CouponRecord | null> {
  const snap = await getDoc(doc(db, 'coupons', code))
  if (!snap.exists()) return null
  return toRecord(snap.id, snap.data())
}

export type CouponState = 'valid' | 'used' | 'expired'

/** `used` wins over `expired`: a coupon that was redeemed stays used even
    after the offer's window closes. */
export function couponState(record: CouponRecord, now = Date.now()): CouponState {
  if (record.usedAt) return 'used'
  if (record.endsAt && Date.parse(record.endsAt) < now) return 'expired'
  return 'valid'
}

/** Marks a coupon spent — the merchant's scan, and the undo that follows. */
export async function markCouponUsed(
  code: string,
  usedBy: string,
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'coupons', code)
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Coupon not found')
    const data = snap.data()
    if (data.usedAt) throw new Error('Coupon already used')
    tx.update(ref, { usedAt: new Date().toISOString(), usedBy })
  })
}

export async function releaseCoupon(code: string): Promise<void> {
  const ref = doc(db, 'coupons', code)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  await updateDoc(ref, { usedAt: null, usedBy: null })
}
