/** Saved offers live on the customer's account:
    users/{uid}/savedOffers/{offerId}. Guests cannot save; every bookmark
    button routes them to sign-in instead. Reading is a live subscription so
    a save made on the offer page lights up the card on Home immediately. */

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'

export type SavedOfferRecord = {
  offerId: string
  savedAt?: Timestamp
}

function savedRef(uid: string, offerId: string) {
  return doc(db, 'users', uid, 'savedOffers', offerId)
}

/** Live set of saved offer ids for one account. Errors yield an empty set
 *  rather than throwing into the UI. */
export function watchSavedOffers(
  uid: string,
  onChange: (ids: Set<string>) => void,
): () => void {
  return onSnapshot(
    collection(db, 'users', uid, 'savedOffers'),
    (snap) => onChange(new Set(snap.docs.map((entry) => entry.id))),
    () => onChange(new Set<string>()),
  )
}

/** Adds or removes one offer from the account. */
export async function setSavedOffer(
  uid: string,
  offerId: string,
  save: boolean,
): Promise<void> {
  if (save) {
    await setDoc(savedRef(uid, offerId), { offerId, savedAt: serverTimestamp() }, { merge: true })
  } else {
    await deleteDoc(savedRef(uid, offerId))
  }
}

const LEGACY_KEY = 'nz.saved'

/** One-time migration of the old guest-local bookmarks into the account.
 *  Runs on sign-in; silently no-ops when there is nothing to move. */
export async function migrateLegacySaved(uid: string): Promise<void> {
  let ids: string[] = []
  try {
    ids = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? '[]') as string[]
  } catch {
    return
  }
  if (!Array.isArray(ids) || ids.length === 0) return

  const batch = writeBatch(db)
  for (const id of ids) {
    if (typeof id !== 'string' || !id) continue
    batch.set(savedRef(uid, id), { offerId: id, savedAt: serverTimestamp() }, { merge: true })
  }
  await batch.commit()
  try {
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    // Storage blocked — the ids are in the account already, so duplicates
    // would be skipped on the next sign-in anyway (setDoc merge by id).
  }
}

/** Exposed for tests/diagnostics; not needed by the UI. */
export async function listSavedOffers(uid: string): Promise<SavedOfferRecord[]> {
  const snap = await getDocs(collection(db, 'users', uid, 'savedOffers'))
  return snap.docs.map((entry) => ({
    offerId: entry.id,
    savedAt: (entry.data() as SavedOfferRecord).savedAt,
  }))
}
