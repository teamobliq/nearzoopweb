/** Follow a shop, and the notification plumbing both channels ride on.
    The shop's follower list lives in shops/{uid}/followers/{cid} (the
    fan-out index); the customer's own list lives in follows/{cid}/shops/{sid}
    (the "who do I follow" index). Both are written in one batch.

    Fan-out split: the client triggers, the serverless function
    (api/notify-followers) does the sending — in-app inbox docs plus FCM
    web push — so the browser never fans out to other people and the
    Firestore rules can stay owner-only. */

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  limit,
  query,
  serverTimestamp,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore'
import { auth, db } from '../firebase'

/** Watches whether this customer follows the shop. Emits `null` while the
    first read is in flight, then true/false and live flips after that. */
export function watchFollowState(
  shopUid: string,
  viewerUid: string,
  onChange: (following: boolean | null) => void,
): () => void {
  return onSnapshot(
    doc(db, 'follows', viewerUid, 'shops', shopUid),
    (snap) => onChange(snap.exists()),
    () => onChange(false),
  )
}

/** Follows a shop — both indexes in one all-or-nothing batch. The customer's
    row denormalises the shop's public fields so a "Following" list never
    needs a second read. */
export async function followShop(
  shopUid: string,
  viewerUid: string,
  shop: {
    shopName: string
    shopCategory?: string | null
    shopPhotoUrl?: string | null
  },
): Promise<void> {
  const batch = writeBatch(db)
  const mine: Record<string, unknown> = {
    followedAt: serverTimestamp(),
    shopName: shop.shopName,
  }
  if (shop.shopCategory) mine.shopCategory = shop.shopCategory
  if (shop.shopPhotoUrl) mine.shopPhotoUrl = shop.shopPhotoUrl
  batch.set(doc(db, 'follows', viewerUid, 'shops', shopUid), mine)
  batch.set(doc(db, 'shops', shopUid, 'followers', viewerUid), {
    followedAt: serverTimestamp(),
  })
  await batch.commit()
}

/** Unfollows — both index rows go in one batch. */
export async function unfollowShop(
  shopUid: string,
  viewerUid: string,
): Promise<void> {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'follows', viewerUid, 'shops', shopUid))
  batch.delete(doc(db, 'shops', shopUid, 'followers', viewerUid))
  await batch.commit()
}

/** Tells the server this offer just went live — the server (Admin SDK)
    writes the inbox items and sends the push to every follower. Fire and
    forget: a failed fan-out must never fail the merchant's save. */
export function notifyOfferLive(args: {
  shopUid: string
  offerId: string
  offerTitle?: string
  discountLabel?: string
}): void {
  const user = auth.currentUser
  if (!user) return
  void user
    .getIdToken()
    .then((token) =>
      fetch('/api/notify-followers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(args),
      }),
    )
    .catch(() => {
      // The fan-out is best-effort by design.
    })
}

/* ---- The customer inbox ----------------------------------------------- */

export type CustomerNotification = {
  id: string
  kind: string
  title: string
  body?: string
  shopUid?: string
  /** Present on rate prompts — the dialog renders it directly. */
  shopName?: string
  offerId?: string
  offerTitle?: string
  read?: boolean
  at?: Timestamp
}

/** Live mirror of the customer's inbox, newest first, capped at 50. */
export function watchCustomerNotifications(
  viewerUid: string,
  onChange: (items: CustomerNotification[]) => void,
): () => void {
  return onSnapshot(
    query(
      collection(db, 'customerNotifications', viewerUid, 'items'),
      orderBy('at', 'desc'),
      limit(50),
    ),
    (snap) =>
      onChange(
        snap.docs.map((entry) => ({
          id: entry.id,
          ...(entry.data() as Omit<CustomerNotification, 'id'>),
        })),
      ),
    () => onChange([]),
  )
}

/** Live unread count — the bell badge. */
export function watchCustomerNotificationsUnread(
  viewerUid: string,
  onChange: (count: number) => void,
): () => void {
  return onSnapshot(
    collection(db, 'customerNotifications', viewerUid, 'items'),
    (snap) =>
      onChange(snap.docs.filter((entry) => entry.data().read !== true).length),
    () => onChange(0),
  )
}

/** Marks the given items read — the inbox screen calls this once on open. */
export async function markCustomerNotificationsRead(
  viewerUid: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return
  const batch = writeBatch(db)
  for (const id of ids) {
    batch.update(doc(db, 'customerNotifications', viewerUid, 'items', id), {
      read: true,
    })
  }
  await batch.commit()
}
