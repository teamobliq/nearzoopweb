/** Customer profile data layer (Firestore).

    The account's record lives at users/{uid}: `profile` holds name / phone /
    email (the shape the original app wrote, alongside `saved` and `area`),
    and `phoneVerified` flags the OTP-verified number. Edits must land in that
    same doc — a second `customers/{uid}` collection would show blank fields
    while the real data sat in `users`.

    Legacy `customers/{uid}` docs (name / mobile / email) are still read as a
    fallback so nothing created earlier disappears. */

import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
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
export type CustomerPatch = Partial<
  Pick<CustomerProfile, 'name' | 'mobile' | 'email' | 'verified'>
>

/** The `profile` map inside users/{uid}. */
type ProfileMap = {
  name?: string | null
  phone?: string | null
  email?: string | null
  stampMs?: number
}

type UserDoc = {
  profile?: ProfileMap | null
  phoneVerified?: boolean
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

/** users/{uid} → the profile shape the screens use. */
function fromUserDoc(uid: string, data: UserDoc): CustomerProfile {
  const profile = data.profile ?? {}
  return {
    uid,
    name: text(profile.name),
    mobile: text(profile.phone),
    email: text(profile.email),
    verified: data.phoneVerified === true,
  }
}

function hasProfile(data: UserDoc | null): boolean {
  return !!data?.profile && Object.keys(data.profile).length > 0
}

/** Reads one customer profile straight from the server. Null when the
    account has neither a users nor a customers doc. */
export async function fetchCustomer(uid: string): Promise<CustomerProfile | null> {
  const userSnap = await getDoc(doc(db, 'users', uid))
  const userData = userSnap.exists() ? (userSnap.data() as UserDoc) : null
  if (hasProfile(userData)) return fromUserDoc(uid, userData as UserDoc)

  const legacy = await getDoc(doc(db, 'customers', uid))
  if (legacy.exists()) {
    return { uid, ...(legacy.data() as Omit<CustomerProfile, 'uid'>) }
  }
  return userData ? fromUserDoc(uid, userData) : null
}

/** Live subscription to the customer's own profile — edits reflect live.
    Watches both docs so a legacy record keeps working; users/{uid} wins. */
export function watchCustomer(
  uid: string,
  onChange: (profile: CustomerProfile | null) => void,
): () => void {
  let userData: UserDoc | null = null
  let userKnown = false
  let legacy: CustomerProfile | null = null
  let legacyKnown = false

  function emit(): void {
    if (!userKnown) return
    if (hasProfile(userData)) {
      onChange(fromUserDoc(uid, userData as UserDoc))
    } else if (legacyKnown) {
      onChange(legacy ?? (userData ? fromUserDoc(uid, userData) : null))
    } else {
      onChange(userData ? fromUserDoc(uid, userData) : null)
    }
  }

  const unsubUser = onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      userData = snap.exists() ? (snap.data() as UserDoc) : null
      userKnown = true
      emit()
    },
    () => {
      userData = null
      userKnown = true
      emit()
    },
  )

  const unsubLegacy = onSnapshot(
    doc(db, 'customers', uid),
    (snap) => {
      legacy = snap.exists()
        ? ({ uid, ...(snap.data() as Omit<CustomerProfile, 'uid'>) } as CustomerProfile)
        : null
      legacyKnown = true
      emit()
    },
    () => {
      legacy = null
      legacyKnown = true
      emit()
    },
  )

  return () => {
    unsubUser()
    unsubLegacy()
  }
}

/** Merges a partial write into users/{uid}.profile (creating the doc if
    missing). Never clobbers unset fields — the map merge keeps phone,
    stampMs and everything else the account already had. */
export async function saveCustomer(uid: string, patch: CustomerPatch): Promise<void> {
  const profile: ProfileMap = { stampMs: Date.now() }
  if ('name' in patch) profile.name = patch.name ?? ''
  if ('mobile' in patch) profile.phone = patch.mobile ?? ''
  if ('email' in patch) profile.email = patch.email ?? ''

  await setDoc(
    doc(db, 'users', uid),
    {
      profile,
      ...(patch.verified === undefined ? {} : { phoneVerified: patch.verified }),
    },
    { merge: true },
  )
}
