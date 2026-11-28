// Teach Me Service Worker — Web Push notifications for live classes

function sanitizeTargetUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return '/';
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed, self.location.origin);
    if (parsed.origin === self.location.origin) {
      return parsed.pathname + parsed.search + parsed.hash;
    }
  } catch (_) {}
  return '/';
}

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Live class started',
    body: 'A teacher you follow just went live. Tap to join.',
    roomId: '',
    url: '/',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    } catch (_) {
      payload.body = event.data.text() || payload.body;
    }
  }

  const targetUrl = payload.roomId
    ? `/?room=${encodeURIComponent(payload.roomId)}`
    : sanitizeTargetUrl(payload.url);

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.roomId ? `live-${payload.roomId}` : 'teachme-live',
      renotify: true,
      data: { url: targetUrl, roomId: payload.roomId || '' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = sanitizeTargetUrl(event.notification.data && event.notification.data.url);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
