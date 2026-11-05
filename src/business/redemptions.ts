import {
  addDoc,
  collection,
  getDocs,
  limit,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore'
import { db } from '../firebase'

/** One confirmed redemption — written by the merchant's scanner the moment a
    coupon is used, and by the manual "Mark 1 redeemed" path. The customer's
    redemption history reads this collection; the shop's insights read the
    offer's `redeemDays` counters, so this log is additive and never writes
    back to the offer.

    It exists because the offer doc only ever holds a count — a customer
    asking "when did I use that?" needs the date, the shop and the value, and
    the count can't say any of those. */
export type RedemptionRecord = {
  id: string
  code: string
  shopUid: string
  shopName: string
  offerId: string
  offerTitle: string
  discountLabel?: string
  customerUid: string
  /** The discount's worth, as the shop stated it — "₹80 off", "free". */
  value?: string
  /** Free-form note the staff member left, e.g. "from bill". */
  note?: string
  at: import('firebase/firestore').Timestamp
  confirmedBy: string
}

export type RedemptionInput = {
  code: string
  shopUid: string
  shopName: string
  offerId: string
  offerTitle: string
  discountLabel?: string
  customerUid: string
  value?: string
  note?: string
  confirmedBy: string
}

/** Records a redemption. Called from the scanner (coupon path) and from the
    manual mark path; both go through here so the history is consistent. */
export async function logRedemption(
  input: RedemptionInput,
): Promise<RedemptionRecord> {
  const ref = await addDoc(collection(db, 'redemptions'), {
    code: input.code,
    shopUid: input.shopUid,
    shopName: input.shopName,
    offerId: input.offerId,
    offerTitle: input.offerTitle,
    ...(input.discountLabel ? { discountLabel: input.discountLabel } : {}),
    customerUid: input.customerUid,
    ...(input.value ? { value: input.value } : {}),
    ...(input.note ? { note: input.note } : {}),
    at: serverTimestamp(),
    confirmedBy: input.confirmedBy,
  })
  return {
    id: ref.id,
    code: input.code,
    shopUid: input.shopUid,
    shopName: input.shopName,
    offerId: input.offerId,
    offerTitle: input.offerTitle,
    discountLabel: input.discountLabel,
    customerUid: input.customerUid,
    value: input.value,
    note: input.note,
    at: new Timestamp(Math.floor(Date.now() / 1000), 0),
    confirmedBy: input.confirmedBy,
  }
}

function toRecord(
  id: string,
  data: Record<string, unknown>,
): RedemptionRecord {
  const at = data.at as
    | { seconds?: number; nanoseconds?: number }
    | undefined
  return {
    id,
    code: String(data.code ?? ''),
    shopUid: String(data.shopUid ?? ''),
    shopName: String(data.shopName ?? ''),
    offerId: String(data.offerId ?? ''),
    offerTitle: String(data.offerTitle ?? ''),
    discountLabel:
      typeof data.discountLabel === 'string' ? data.discountLabel : undefined,
    customerUid: String(data.customerUid ?? ''),
    value: typeof data.value === 'string' ? data.value : undefined,
    note: typeof data.note === 'string' ? data.note : undefined,
    at: at && typeof at.seconds === 'number'
      ? new Timestamp(at.seconds, at.nanoseconds ?? 0)
      : new Timestamp(Math.floor(Date.now() / 1000), 0),
    confirmedBy: String(data.confirmedBy ?? ''),
  }
}

/** A customer's confirmed redemptions, newest first. Single-field query —
    no composite index to deploy. */
export async function listMyRedemptions(
  customerUid: string,
): Promise<RedemptionRecord[]> {
  const snap = await getDocs(
    query(
      collection(db, 'redemptions'),
      where('customerUid', '==', customerUid),
      limit(100),
    ),
  )
  const records = snap.docs.map((d) => toRecord(d.id, d.data()))
  records.sort((a, b) => (a.at.seconds > b.at.seconds ? -1 : 1))
  return records
}

/** Deletes a redemption — the scanner's undo window puts the log back. */
export async function deleteRedemption(id: string): Promise<void> {
  const { deleteDoc, doc } = await import('firebase/firestore')
  await deleteDoc(doc(db, 'redemptions', id))
}

/** A customer reporting a redemption the shop never confirmed. The report
    is filed under the customer's uid so the shop can match it against its
    own records; the original log is untouched. */
export type RedemptionReport = {
  id: string
  customerUid: string
  /** The redemption the customer believes happened — the shop matches it
      against its own records. */
  offerId: string
  offerTitle: string
  shopUid: string
  shopName: string
  /** When the customer says it was redeemed. */
  at: string
  /** Free-form: what they got, what they paid, where the gap is. */
  note: string
  status: 'open' | 'resolved'
  createdAt: import('firebase/firestore').Timestamp
}

export type RedemptionReportInput = {
  customerUid: string
  offerId: string
  offerTitle: string
  shopUid: string
  shopName: string
  at: string
  note: string
}

export async function reportRedemption(
  input: RedemptionReportInput,
): Promise<RedemptionReport> {
  const { addDoc, collection, serverTimestamp } = await import(
    'firebase/firestore',
  )
  const ref = await addDoc(collection(db, 'redemption_reports'), {
    customerUid: input.customerUid,
    offerId: input.offerId,
    offerTitle: input.offerTitle,
    shopUid: input.shopUid,
    shopName: input.shopName,
    at: input.at,
    note: input.note,
    status: 'open',
    createdAt: serverTimestamp(),
  })
  return {
    id: ref.id,
    customerUid: input.customerUid,
    offerId: input.offerId,
    offerTitle: input.offerTitle,
    shopUid: input.shopUid,
    shopName: input.shopName,
    at: input.at,
    note: input.note,
    status: 'open',
    createdAt: new Timestamp(Math.floor(Date.now() / 1000), 0),
  }
}