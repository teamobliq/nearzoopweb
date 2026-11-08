// Background push for NearZoop — receives new-offer pushes and shows
// the system notification. The Firebase config here is the public web
// config (already shipped in the JS bundle); nothing secret lives here.
// These values are inlined literally because everything in public/ is
// copied to the build verbatim — there is no build-time substitution
// step for this file. Keep them in sync with the VITE_FIREBASE_* block
// in .env / Vercel if the project ever changes.
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBZ4HrrMjrgk5Q2l5nMJ2fTRuFgxqsOITc',
  authDomain: 'nearzoop.firebaseapp.com',
  projectId: 'nearzoop',
  storageBucket: 'nearzoop.firebasestorage.app',
  messagingSenderId: '287400314808',
  appId: '1:287400314808:web:8b77864276819d3aad714d',
  measurementId: 'G-X5Z4YVZZQ0',
});
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title ?? 'A shop you follow posted a new offer';
  const body = payload?.notification?.body ?? 'Tap to see it.';
  self.registration.showNotification(title, {
    body,
    icon: '/icon.svg',
    data: payload?.data ?? {},
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification?.data?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
