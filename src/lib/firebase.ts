// Lightweight Client Event & Browser Notification Helper
// Cleaned of unpinned external CDN scripts and production token logging.

export async function trackEvent(eventName: string, eventParams?: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.debug(`[Analytics Event] ${eventName}`, eventParams || {});
  }
  try {
    if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
      (window as any).gtag('event', eventName, eventParams);
    }
  } catch {
    // Ignore analytics transport errors
  }
}

export async function requestNotificationPermission(): Promise<string | null> {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      let deviceToken = localStorage.getItem('tm_fcm_token');
      if (!deviceToken) {
        const bytes = new Uint8Array(12);
        crypto.getRandomValues(bytes);
        const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        deviceToken = `push-${hex}`;
        localStorage.setItem('tm_fcm_token', deviceToken);
      }
      // Never print push tokens to console logs
      return deviceToken;
    }
    return null;
  } catch {
    return null;
  }
}

export function listenToForegroundMessages(callback: (payload: unknown) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleCustomPush = (event: Event) => {
    const customEvent = event as CustomEvent;
    if (customEvent.detail) {
      callback(customEvent.detail);
    }
  };

  window.addEventListener('fcm-push-received', handleCustomPush);
  return () => window.removeEventListener('fcm-push-received', handleCustomPush);
}
