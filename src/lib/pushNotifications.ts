import { supabase } from './supabase';

export type PushSupportStatus = 'supported' | 'unsupported' | 'denied' | 'missing_vapid' | 'subscribed';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isWebPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    window.isSecureContext
  );
}

export async function getPushStatus(): Promise<PushSupportStatus> {
  if (!isWebPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey) return 'missing_vapid';
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const existing = await reg?.pushManager?.getSubscription();
    if (existing) return 'subscribed';
  } catch (_) {}
  return 'supported';
}

export async function enableWebPushNotifications(userId: string): Promise<{
  ok: boolean;
  status: PushSupportStatus;
  message?: string;
}> {
  if (!isWebPushSupported()) {
    return {
      ok: false,
      status: 'unsupported',
      message: 'Web Push is not supported on this browser/device. In-app live notifications remain active.',
    };
  }

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    return {
      ok: false,
      status: 'missing_vapid',
      message: 'Web Push VAPID public key is not configured yet. In-app live notifications remain active.',
    };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        ok: false,
        status: 'denied',
        message: 'Browser notification permission was not granted.',
      };
    }

    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
      });
    }

    const subJson = subscription.toJSON();
    const endpoint = subJson.endpoint || subscription.endpoint;
    const p256dh = subJson.keys?.p256dh || '';
    const auth = subJson.keys?.auth || '';

    if (!endpoint || !p256dh || !auth) {
      return { ok: false, status: 'unsupported', message: 'Browser returned an incomplete push subscription.' };
    }

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint,
        p256dh,
        auth,
        user_agent: navigator.userAgent.slice(0, 250),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,endpoint' }
    );

    if (error) {
      console.warn('Could not save push subscription:', error.message);
      return { ok: false, status: 'supported', message: error.message };
    }

    return { ok: true, status: 'subscribed' };
  } catch (err: any) {
    console.warn('Web Push registration fallback:', err?.message || err);
    return {
      ok: false,
      status: 'unsupported',
      message: err?.message || 'Push notifications unavailable on this device.',
    };
  }
}

export async function triggerLivePushEdgeFunction(payload: {
  tutorId: string;
  tutorName: string;
  subject: string;
  roomId: string;
}): Promise<void> {
  try {
    await supabase.functions.invoke('send-live-push', {
      body: payload,
    });
  } catch (_) {
    // Graceful degradation: in-app Realtime notifications are already created by DB RPC
  }
}