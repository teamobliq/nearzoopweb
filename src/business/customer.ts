/** Customer profile data layer (Firestore).
    One doc per customer: customers/{uid} — mirrors the auth uid so the
    profile follows the account. Fields: name, mobile, email (optional).
    The edit screen reads and writes here; the profile screen reads here.
    Anyone signed in may read/write their own doc; admins may read all. */

import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'

export type CustomerProfile = {
  uid: string
  name: string | null
  mobile: string | null
  email: string | null
  verified?: boolean
  updatedAt?: Timestamp
}

/** A partial write — any subset of the profile fields. */
export type CustomerPatch = Partial<Pick<CustomerProfile, 'name' | 'mobile' | 'email' | 'verified'>>

/** Merges a partial write into the customer's profile doc (creates it if
    missing). Never clobbers unset fields. */
export async function saveCustomer(uid: string, patch: CustomerPatch): Promise<void> {
  await setDoc(
    doc(db, 'customers', uid),
    { ...patch, updatedAt: serverTimestamp() },
    { merge: true },
  )
}

/** Reads one customer profile straight from the server. Null when missing. */
export async function fetchCustomer(uid: string): Promise<CustomerProfile | null> {
  const snap = await getDoc(doc(db, 'customers', uid), { source: 'server' })
  if (!snap.exists()) return null
  return { uid: snap.id, ...(snap.data() as CustomerProfile) }
}

/** Live subscription to the customer's own profile — edits reflect live. */
export function watchCustomer(
  uid: string,
  onChange: (profile: CustomerProfile | null) => void,
): () => void {
  return onSnapshot(
    doc(db, 'customers', uid),
    (snap) => {
      onChange(snap.exists() ? ({ uid: snap.id, ...(snap.data() as CustomerProfile) } as CustomerProfile) : null)
    },
    () => onChange(null),
  )
}
