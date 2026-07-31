/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_EMAIL?: string;
  readonly VITE_ADMIN_PASSWORD?: string;
  readonly VITE_CHARGILY_PUBLIC_KEY?: string;
  readonly VITE_CHARGILY_SECRET_KEY?: string;
  readonly VITE_CHARGILY_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
