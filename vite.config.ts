import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Explicit public env allowlist: prevents accidental VITE_*_SECRET / VITE_*_PASSWORD exposure in client bundles
  envPrefix: [
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_VAPID_PUBLIC_KEY",
    "VITE_PRODUCTION_URL",
    "VITE_PAID_PLANS_ENABLED",
    "VITE_FREE_TRIAL_CREDITS",
    "VITE_CHARGILY_PUBLIC_KEY",
    "VITE_CHARGILY_MODE",
    "VITE_FIREBASE_",
  ],
  build: {
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: true
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
