import { supabase, authLog } from './supabase';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';

export const ANDROID_PACKAGE_NAME = 'com.teachme.app';
export const ANDROID_OAUTH_REDIRECT_URI = 'com.teachme.app://google-auth';
export const PRODUCTION_WEB_URL = 'https://teachmelearn.netlify.app';

/**
 * Robust detection for Android Native environment, Android WebView, or file:// scheme.
 */
export const isAndroidNative = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  const origin = window.location.origin || '';
  const protocol = window.location.protocol || '';
  const isFileScheme = protocol === 'file:' || origin === 'file://' || origin === 'null' || origin.startsWith('file:');
  
  const isCapacitorNative = Boolean(
    (window as any).Capacitor?.isNativePlatform?.() ||
    ((window as any).Capacitor && (window as any).Capacitor?.getPlatform?.() === 'android')
  );

  return isCapacitorNative || isFileScheme;
};

/**
 * Returns a valid, safe redirect URL that will NEVER be file:// or null.
 * In Capacitor/Android native shells, always returns the custom deep-link scheme
 * so OAuth returns directly into the app instead of staying in an external browser.
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
    // Do not block OAuth if settings check fails due to transient network/CORS issue
    return { enabled: true };
  }
}

/**
 * Handles incoming deep link URL (e.g., com.teachme.app://google-auth?code=... or #access_token=...)
 */
export async function handleOAuthDeepLink(url: string): Promise<boolean> {
  if (!url) return false;
  authLog(`Processing deep link URL: ${url}`);
  try {
    const rawUrl = url.replace('#', '?');
    const urlObj = new URL(rawUrl);
    const accessToken = urlObj.searchParams.get('access_token');
    const refreshToken = urlObj.searchParams.get('refresh_token');
    const code = urlObj.searchParams.get('code');

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
 * Performs Android-specific Google Sign-In using Chrome Custom Tabs / Deep Linking.
 * Bypasses disallowed_useragent restrictions of standard embedded WebViews.
 */
export async function performAndroidGoogleSignIn(role: 'student' | 'tutor' | 'admin'): Promise<{ success: boolean; error?: string }> {
  try {
    authLog(`Starting Android Google Sign-In with role: ${role}`);
    localStorage.setItem('tm_pending_oauth_role', role);

    const providerStatus = await checkGoogleProviderEnabled();
    if (!providerStatus.enabled) {
      return { success: false, error: providerStatus.reason };
    }

    const redirectUri = getSafeRedirectUrl();

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

    // Try native Capacitor Browser & App plugins first
    try {
      const urlListener = await App.addListener('appUrlOpen', async (event: { url: string }) => {
        authLog(`appUrlOpen event fired in performAndroidGoogleSignIn: ${event.url}`);
        if (event.url && (event.url.includes('google-auth') || event.url.includes('com.teachme.app') || event.url.includes('access_token') || event.url.includes('code='))) {
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
      authLog(`Capacitor plugin open fallback: ${pluginErr}`);
      if (typeof window !== 'undefined' && (window as any).open) {
        const win = window.open(data.url, '_system');
        if (!win) {
          window.location.href = data.url;
        }
        return { success: true };
      } else {
        window.location.href = data.url;
        return { success: true };
      }
    }
  } catch (err: any) {
    authLog(`performAndroidGoogleSignIn exception: ${err.message}`);
    return {
      success: false,
      error: err.message || 'Android Google Sign-In encountered an unexpected error.'
    };
  }
}
