/** Web-push registration for the customer app. Every failure degrades to
    the in-app inbox — a push hiccup must never break a follow, a claim or
    a save. The one-time Firebase console step (Cloud Messaging → Web Push
    certificates → generate the VAPID key pair) is required before this can
    deliver: add it as `VITE_FIREBASE_VAPID_KEY` in .env and in Vercel. */

import { getMessaging, getToken, isSupported } from 'firebase/messaging'
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, firebaseApp } from '../firebase'

let messagingPromise: Promise<ReturnType<typeof getMessaging> | null> | null =
  null

/** Messaging is only available in real browsers with service workers —
    `isSupported()` is the honest gate. */
function loadMessaging() {
  if (!messagingPromise) {
    messagingPromise = isSupported()
      .then((ok) => (ok ? getMessaging(firebaseApp) : null))
      .catch(() => null)
  }
  return messagingPromise
}

/** Asks for permission (browsers require a user gesture — call from a tap),
    registers the service worker and stores this device's token under the
    customer's uid. Returns whether push is ready on this device right now. */
export async function enablePush(viewerUid: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  const messaging = await loadMessaging()
  if (!messaging) return false
  try {
    let permission = Notification.permission
    if (permission === 'default') {
      permission = await Notification.requestPermission()
    }
    if (permission !== 'granted') return false

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
    if (!vapidKey) {
      // Not wired yet — the in-app inbox still delivers everything.
      return false
    }

    const registration = await navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL ?? '/'}firebase-messaging-sw.js`,
    )
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    })
    if (!token) return false

    await setDoc(
      doc(db, 'fcmTokens', viewerUid, 'tokens', token),
      { token, createdAt: serverTimestamp() },
      { merge: true },
    )
    return true
  } catch (err) {
    console.warn('enablePush failed:', err)
    return false
  }
}

/** Stops this device's push delivery — used by the Settings surface, should
    one ever offer "turn off new-offer pushes". */
export async function disablePush(viewerUid: string): Promise<void> {
  const messaging = await loadMessaging()
  if (!messaging) return
  try {
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
    const registration = await navigator.serviceWorker.getRegistration(
      `${import.meta.env.BASE_URL ?? '/'}firebase-messaging-sw.js`,
    )
    if (!registration || !vapidKey) return
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    }).catch(() => null)
    if (token) {
      await deleteDoc(doc(db, 'fcmTokens', viewerUid, 'tokens', token))
    }
  } catch {
    // Token already forgotten — nothing to undo.
  }
}
