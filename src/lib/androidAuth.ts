import { supabase, authLog } from './supabase';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';

export const ANDROID_PACKAGE_NAME = 'com.teachme.app';
export const ANDROID_OAUTH_REDIRECT_URI = 'com.teachme.app://login-callback';
export const ANDROID_LEGACY_OAUTH_REDIRECT_URI = 'com.teachme.app://google-auth';
export const PRODUCTION_WEB_URL = 'https://teachmelearn.netlify.app';

/**
 * Robust detection for Android Native environment, Android WebView, or file:// scheme.
 */
export const isAndroidNative = (): boolean => {
  if (typeof window === 'undefined') return false;

  const origin = window.location.origin || '';
  const protocol = window.location.protocol || '';
  const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';

  const isFileScheme =
    protocol === 'file:' ||
    origin === 'file://' ||
    origin === 'null' ||
    origin.startsWith('file:');

  const isCapacitorNative = Boolean(
    (window as any).Capacitor?.isNativePlatform?.() ||
    ((window as any).Capacitor && (window as any).Capacitor?.getPlatform?.() === 'android')
  );

  const isAndroidWebViewUA =
    /; wv\)/i.test(ua) ||
    (/\bAndroid\b/i.test(ua) && /\bVersion\/[\d.]+/i.test(ua)) ||
    Boolean((window as any).AndroidWebView || (window as any).TeachMeAndroid);

  return isCapacitorNative || isFileScheme || isAndroidWebViewUA;
};

/**
 * Returns true specifically when running inside a file:// Android WebView shell
 * (without Capacitor native plugin bridge).
 */
export const isPureFileWebView = (): boolean => {
  if (typeof window === 'undefined') return false;
  const protocol = window.location.protocol || '';
  const origin = window.location.origin || '';
  const isFile = protocol === 'file:' || origin === 'file://' || origin === 'null' || origin.startsWith('file:');
  const hasCapNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
  return isFile && !hasCapNative;
};

/**
 * Returns a valid, safe redirect URL that will NEVER be file:// or null.
 * In Android WebView / Capacitor shells, always returns the custom Deep Link
 * (`com.teachme.app://login-callback`) so OAuth returns directly into the app.
 */
export const getSafeRedirectUrl = (): string => {
  if (typeof window === 'undefined') return PRODUCTION_WEB_URL;

  if (isAndroidNative()) {
    authLog(`Using Android deep-link redirect URI: ${ANDROID_OAUTH_REDIRECT_URI}`);
    return ANDROID_OAUTH_REDIRECT_URI;
  }

  const origin = window.location.origin || '';
  const protocol = window.location.protocol || '';
  if (protocol === 'file:' || origin === 'file://' || origin === 'null' || origin.startsWith('file:') || !origin) {
    authLog(`Using fallback production redirect URI: ${PRODUCTION_WEB_URL}`);
    return PRODUCTION_WEB_URL;
  }

  const webRedirect = `${origin}/`;
  authLog(`Using Web redirect URI: ${webRedirect}`);
  return webRedirect;
};

/**
 * Lightweight preflight check to verify whether the Google OAuth provider is enabled
 * in Supabase Auth before redirecting away from the app.
 */
export async function checkGoogleProviderEnabled(): Promise<{ enabled: boolean; reason?: string }> {
  try {
    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || 'https://priqushrcnedrtkpmbzu.supabase.co').replace(/\/$/, '');
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_1eYu1ny3h-eTvmtT6WSwOA_hDfO_vyo';
    const res = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: supabaseAnonKey ? { apikey: supabaseAnonKey } : undefined
    });
    if (!res.ok) return { enabled: true };
    const settings = await res.json();
    if (settings?.external && settings.external.google === false) {
      return {
        enabled: false,
        reason: 'Google Sign-In is not yet enabled in Supabase Authentication → Providers → Google.'
      };
    }
    return { enabled: true };
  } catch (_) {
    return { enabled: true };
  }
}

/**
 * Handles incoming deep link URL:
 *   com.teachme.app://login-callback?code=...
 *   com.teachme.app://login-callback#access_token=...&refresh_token=...
 *   com.teachme.app://google-auth?...
 */
export async function handleOAuthDeepLink(url: string): Promise<boolean> {
  if (!url) return false;
  authLog(`Processing deep link URL: ${url}`);
  try {
    // Parse both query (?...) and hash (#...) parameters safely
    const qIdx = url.indexOf('?');
    const hIdx = url.indexOf('#');
    const queryStr = qIdx >= 0 ? url.slice(qIdx + 1, hIdx > qIdx ? hIdx : undefined) : '';
    const hashStr = hIdx >= 0 ? url.slice(hIdx + 1) : '';

    const queryParams = new URLSearchParams(queryStr);
    const hashParams = new URLSearchParams(hashStr);

    const accessToken = hashParams.get('access_token') || queryParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token');
    const code = queryParams.get('code') || hashParams.get('code');

    if (accessToken && refreshToken) {
      authLog('Setting session from deep link access_token and refresh_token');
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      if (error) {
        authLog(`Error setting session from deep link tokens: ${error.message}`);
        return false;
      }
      authLog('Successfully restored session from deep link access_token');
      return true;
    } else if (code) {
      authLog(`Exchanging deep link authorization code: ${code}`);
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        authLog(`Error exchanging deep link code for session: ${error.message}`);
        return false;
      }
      authLog(`Successfully exchanged deep link code for session for user: ${data.user?.id}`);
      return true;
    }
  } catch (err: any) {
    authLog(`Deep link parsing exception: ${err?.message || err}`);
  }
  return false;
}

/**
 * Performs Android WebView / Capacitor Google Sign-In WITHOUT exiting to an external browser.
 * - Uses custom Deep Link `com.teachme.app://login-callback`.
 * - In pure Android WebView (`file:///android_asset/index.html`), navigates inside the WebView
 *   (which uses a clean Chrome User-Agent and intercepts `com.teachme.app://login-callback`).
 * - In Capacitor native, opens in-app Chrome Custom Tabs (`Browser.open`) and listens on `appUrlOpen`.
 */
export async function performAndroidGoogleSignIn(role: 'student' | 'tutor' | 'admin'): Promise<{ success: boolean; error?: string }> {
  try {
    authLog(`Starting Android Google Sign-In with role: ${role}`);
    localStorage.setItem('tm_pending_oauth_role', role);

    const providerStatus = await checkGoogleProviderEnabled();
    if (!providerStatus.enabled) {
      return { success: false, error: providerStatus.reason };
    }

    const redirectUri = ANDROID_OAUTH_REDIRECT_URI;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUri,
        skipBrowserRedirect: true,
        queryParams: {
          prompt: 'select_account',
          access_type: 'offline'
        }
      }
    });

    if (error) {
      authLog(`Android signInWithOAuth error: ${error.message}`);
      return { success: false, error: error.message };
    }

    if (!data?.url) {
      authLog('No OAuth URL returned from Supabase');
      return { success: false, error: 'Could not generate OAuth authentication URL for Android.' };
    }

    authLog(`OAuth URL generated for Android: ${data.url}`);

    // Pure file:///android_asset WebView: stay inside the WebView itself (MainActivity sets Chrome UA + intercepts deep link)
    if (isPureFileWebView()) {
      authLog('Pure Android WebView detected — navigating in-app inside WebView');
      window.location.href = data.url;
      return { success: true };
    }

    // Capacitor native: use in-app Chrome Custom Tab + App deep-link listener
    try {
      const urlListener = await App.addListener('appUrlOpen', async (event: { url: string }) => {
        authLog(`appUrlOpen event fired in performAndroidGoogleSignIn: ${event.url}`);
        if (
          event.url &&
          (event.url.includes('login-callback') ||
            event.url.includes('google-auth') ||
            event.url.includes('com.teachme.app') ||
            event.url.includes('access_token') ||
            event.url.includes('code='))
        ) {
          try {
            await handleOAuthDeepLink(event.url);
          } finally {
            try {
              await Browser.close();
            } catch (_) {}
            urlListener.remove();
          }
        }
      });

      authLog('Opening in-app Chrome Custom Tab for OAuth');
      await Browser.open({ url: data.url, presentationStyle: 'popover' });
      return { success: true };
    } catch (pluginErr) {
      // Never use _system external browser — stay inside the current WebView
      authLog(`Capacitor Browser plugin unavailable (${pluginErr}); staying in-app via WebView navigation`);
      window.location.href = data.url;
      return { success: true };
    }
  } catch (err: any) {
    authLog(`performAndroidGoogleSignIn exception: ${err.message}`);
    return {
      success: false,
      error: err.message || 'Android Google Sign-In encountered an unexpected error.'
    };
  }
}
