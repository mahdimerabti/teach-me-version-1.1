/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  readonly VITE_PRODUCTION_URL?: string;
  readonly VITE_PAID_PLANS_ENABLED?: string;
  readonly VITE_FREE_TRIAL_CREDITS?: string;
  readonly VITE_CHARGILY_PUBLIC_KEY?: string;
  readonly VITE_CHARGILY_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
