// Background push for NearZoop — receives new-offer pushes and shows
// the system notification. The Firebase config here is the public web
// config (already shipped in the JS bundle); nothing secret lives here.
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp(${JSON.stringify(cfg)});
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
