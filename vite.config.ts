// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  nitro: {
    // Render/local: node-server (.output/server). Vercel CI define VERCEL=1 → preset vercel.
    preset: process.env.VERCEL ? "vercel" : "node-server",
    env: [
      "VITE_SUPABASE_URL",
      "VITE_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "ADMIN_SETUP_SECRET",
      "NEXT_PUBLIC_EVIDENCIA_WEBHOOK_SECRET",
      "EVIDENCIA_WEBHOOK_SECRET",
      "VITE_EVIDENCIA_WEBHOOK_SECRET",
      "evidencia_webhook_secret",
    ],
  },
  // SSR no Render falha com jsxDEV (runtime de dev) se development=true no OXC.
  vite: {
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
    define: {
      "import.meta.env.NEXT_PUBLIC_EVIDENCIA_WEBHOOK_SECRET": JSON.stringify(
        process.env.NEXT_PUBLIC_EVIDENCIA_WEBHOOK_SECRET ??
          process.env.EVIDENCIA_WEBHOOK_SECRET ??
          process.env.VITE_EVIDENCIA_WEBHOOK_SECRET ??
          process.env.evidencia_webhook_secret ??
          "",
      ),
      "import.meta.env.VITE_EVIDENCIA_WEBHOOK_SECRET": JSON.stringify(
        process.env.VITE_EVIDENCIA_WEBHOOK_SECRET ??
          process.env.NEXT_PUBLIC_EVIDENCIA_WEBHOOK_SECRET ??
          process.env.EVIDENCIA_WEBHOOK_SECRET ??
          process.env.evidencia_webhook_secret ??
          "",
      ),
    },
    oxc: {
      jsx: {
        development: false,
      },
    },
  },
});
