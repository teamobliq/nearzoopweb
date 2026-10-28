// Firebase initialization
// Docs: https://firebase.google.com/docs/web/setup#available-libraries
//
// Config values come from Vite env vars — see .env (local) and .env.example
// (template). Vite only exposes variables prefixed with VITE_ to the client,
// and bakes them in at build time. These particular values are public web
// config (not secrets), safe to ship to the browser.

import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getAnalytics, isSupported } from 'firebase/analytics'

function requireEnv(key: string): string {
  const value = import.meta.env[key]
  if (!value) {
    throw new Error(`Missing Firebase config: set ${key} in your .env file`)
  }
  return value
}

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const firebaseConfig = {
  apiKey: requireEnv('VITE_FIREBASE_API_KEY'),
  authDomain: requireEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: requireEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: requireEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requireEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: requireEnv('VITE_FIREBASE_APP_ID'),
  measurementId: requireEnv('VITE_FIREBASE_MEASUREMENT_ID'),
}

// Initialize Firebase
export const firebaseApp = initializeApp(firebaseConfig)

// Auth service — used by the sign-in screens
export const auth = getAuth(firebaseApp)

// Analytics only runs in environments that support it (real browsers with
// IndexedDB/localStorage). Guarding with isSupported() prevents crashes in
// SSR, tests, or restricted environments.
void isSupported().then((supported) => {
  if (supported) {
    getAnalytics(firebaseApp)
  }
})
