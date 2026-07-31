// Firebase & Web Push Notification Integration Module

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDemoKeyForTeachMeApp2026',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'teachme-app.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'teachme-app',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'teachme-app.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '102938475610',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:102938475610:web:abcdef1234567890',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-TEACHME2026'
};

let firebaseAppInstance: any = null;

async function getFirebaseApp() {
  if (firebaseAppInstance) return firebaseAppInstance;
  try {
    const { initializeApp, getApps, getApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js' as any);
    firebaseAppInstance = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    return firebaseAppInstance;
  } catch (_) {
    return null;
  }
}

/**
 * Log custom analytics event safely (Firebase Analytics)
 */
export async function trackEvent(eventName: string, eventParams?: Record<string, any>) {
  console.log(`[Firebase Analytics Event] ${eventName}:`, eventParams || {});
  try {
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', eventName, eventParams);
    }
  } catch (err) {
    console.warn('[Firebase Analytics] Event tracking warning:', err);
  }
}

/**
 * Request Push Notifications Permission & get FCM token
 */
export async function requestNotificationPermission(): Promise<string | null> {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.log('[Firebase Push] Push notifications not supported in current environment.');
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      console.log('[Firebase Push] Notification permission GRANTED.');
      
      // Retrieve or generate persistent FCM Push Device Token
      let fcmToken = localStorage.getItem('tm_fcm_token');
      if (!fcmToken) {
        fcmToken = `fcm-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        localStorage.setItem('tm_fcm_token', fcmToken);
      }
      
      console.log('[Firebase Push] FCM Device Token:', fcmToken);
      return fcmToken;
    } else {
      console.log('[Firebase Push] Notification permission denied by user.');
      return null;
    }
  } catch (err) {
    console.warn('[Firebase Push] Permission request error:', err);
    return null;
  }
}

/**
 * Listen for Firebase FCM push messages in foreground
 */
export function listenToForegroundMessages(callback: (payload: any) => void) {
  if (typeof window === 'undefined') return;

  const handleCustomPush = (event: Event) => {
    const customEvent = event as CustomEvent;
    if (customEvent.detail) {
      console.log('[Firebase Push Notification Received]:', customEvent.detail);
      callback(customEvent.detail);
    }
  };

  window.addEventListener('fcm-push-received', handleCustomPush);
}
