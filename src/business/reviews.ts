/** Shop reviews — the data layer for the Reviews tab on a shop's page,
    the average chip beside it, and the rate-prompt flow. One doc per
    (offer, customer) at shops/{uid}/reviews/{offerId}_{customerUid}:
    deterministic ids mean re-rating overwrites instead of stacking, and
    the serverless /api/rate-prompt can cheaply tell it already happened. */

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from 'firebase/firestore'
import { auth, db } from '../firebase'

export type ReviewRecord = {
  id: string
  customerUid: string
  shopUid: string
  offerId?: string
  /** 1–5 — the shop rating, the number the chip and Reviews list share. */
  rating: number
  /** 1–5 — the offer rating, captured alongside for the merchant's own view. */
  offerRating?: number
  comment?: string
  customerName?: string
  createdAt?: Timestamp
}

export type ReviewSummary = {
  reviews: ReviewRecord[]
  count: number
  average: number
}

/** Live reviews for one shop — newest first, plus the average and count
    the chip and header show. Reads are public (the shop page is browsed
    by guests). */
export function watchShopReviews(
  shopUid: string,
  onChange: (summary: ReviewSummary) => void,
): () => void {
  return onSnapshot(
    query(
      collection(db, 'shops', shopUid, 'reviews'),
      orderBy('createdAt', 'desc'),
    ),
    (snap) => {
      const reviews = snap.docs.map((entry) => ({
        id: entry.id,
        ...(entry.data() as Omit<ReviewRecord, 'id'>),
      }))
      const count = reviews.length
      const average =
        count === 0
          ? 0
          : reviews.reduce((sum, review) => sum + review.rating, 0) / count
      onChange({ reviews, count, average })
    },
    () => onChange({ reviews: [], count: 0, average: 0 }),
  )
}

/** Writes (or replaces) the caller's review for this offer. The doc id is
    the pair, so the same customer re-rating simply updates their row. */
export async function saveReview(args: {
  shopUid: string
  offerId: string
  customerUid: string
  rating: number
  offerRating?: number
  comment?: string
  customerName?: string
}): Promise<void> {
  const reviewId = `${args.offerId}_${args.customerUid}`
  await setDoc(
    doc(db, 'shops', args.shopUid, 'reviews', reviewId),
    {
      customerUid: args.customerUid,
      shopUid: args.shopUid,
      offerId: args.offerId,
      rating: Math.round(args.rating),
      ...(args.offerRating ? { offerRating: Math.round(args.offerRating) } : {}),
      ...(args.comment?.trim() ? { comment: args.comment.trim() } : {}),
      ...(args.customerName?.trim() ? { customerName: args.customerName.trim() } : {}),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  )
}

/** Asks the server (Admin SDK) to drop a "how was it?" prompt into the
    customer's inbox. Fire-and-forget: a failed prompt must never fail a
    claim or a redemption. */
export function requestRatePrompt(args: {
  shopUid: string
  customerUid: string
  offerId: string
  offerTitle?: string
  discountLabel?: string
}): void {
  const user = auth.currentUser
  if (!user) return
  void user
    .getIdToken()
    .then((token) =>
      fetch('/api/rate-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(args),
      }),
    )
    .catch(() => {
      // The claim/redemption must never fail on the prompt.
    })
}
