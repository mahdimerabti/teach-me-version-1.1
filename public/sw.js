// Teach Me Service Worker — Web Push notifications for live classes
// Hardened against cross-origin open redirects in notificationclick.

function toSafeSameOriginPath(rawUrl, rawRoomId) {
  if (typeof rawRoomId === 'string' && /^[A-Za-z0-9_-]{3,100}$/.test(rawRoomId.trim())) {
    return `/?room=${encodeURIComponent(rawRoomId.trim())}`;
  }
  if (typeof rawUrl === 'string') {
    const trimmed = rawUrl.trim();
    // Allow strictly relative single-slash paths on our own origin (reject '//evil.com' or 'https://...')
    if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')) {
      return trimmed;
    }
  }
  return '/';
}

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Live class started',
    body: 'A teacher you follow just went live. Tap to join.',
    roomId: '',
    url: '/'
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        payload = {
          title: typeof parsed.title === 'string' ? parsed.title.slice(0, 120) : payload.title,
          body: typeof parsed.body === 'string' ? parsed.body.slice(0, 240) : payload.body,
          roomId: typeof parsed.roomId === 'string' ? parsed.roomId.slice(0, 100) : '',
          url: typeof parsed.url === 'string' ? parsed.url.slice(0, 200) : '/'
        };
      }
    } catch (_) {
      const text = event.data.text();
      if (text) payload.body = text.slice(0, 240);
    }
  }

  const safePath = toSafeSameOriginPath(payload.url, payload.roomId);
  const safeRoomTag = /^[A-Za-z0-9_-]{3,100}$/.test(payload.roomId)
    ? `live-${payload.roomId}`
    : 'teachme-live';

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: safeRoomTag,
      renotify: true,
      data: { url: safePath, roomId: payload.roomId || '' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const safePath = toSafeSameOriginPath(data.url, data.roomId);
  const destinationUrl = new URL(safePath, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        try {
          const clientOrigin = new URL(client.url).origin;
          if (clientOrigin === self.location.origin && 'focus' in client) {
            client.navigate(destinationUrl);
            return client.focus();
          }
        } catch (_) {}
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(destinationUrl);
      }
    })
  );
});
