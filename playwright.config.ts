import { defineConfig, devices } from "@playwright/test";
import process from "node:process";

/**
 * E2E suite — deterministic, zero external API keys.
 *
 * Determinism strategy (see docs/E2E.md):
 * - The dev server is started with EVERY server-side AI credential blanked,
 *   so /api/chat returns 503 and the client falls back to the deterministic
 *   offline mock translator (translateWithMock in
 *   src/services/translationService.ts). Known inputs ("hello", "thank you",
 *   ...) produce fixed Cantonese output — no network, no flakiness.
 * - Blanking uses empty strings (not deletion) on purpose: Vite's loadEnv
 *   gives process.env priority over .env files, so an empty string reliably
 *   overrides a developer's real key in .env. A missing variable would NOT.
 * - TTS/STT are unavailable in this mode; specs never depend on audio.
 * - VITE_STORAGE_MODE=local keeps persistence in IndexedDB; each Playwright
 *   test gets a fresh browser context, i.e. a clean database.
 */
const E2E_PORT = 5199;
const IS_CI = !!process.env.CI;

const KEYLESS_ENV: Record<string, string> = {
  // Server-side AI credentials — every name read by api/_lib/*.js cores.
  OPENAI_API_KEY: "",
  LLM_API_KEY: "",
  VITE_OPENAI_API_KEY: "",
  GOOGLE_API_JSON: "",
  VITE_GOOGLE_API_JSON: "",
  STT_API_KEY: "",
  // Rate-limit store — keep tests on the in-memory fallback.
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
  // Client flags: local IndexedDB storage, no Supabase, no access-code gate.
  VITE_STORAGE_MODE: "local",
  VITE_SUPABASE_URL: "",
  VITE_SUPABASE_ANON_KEY: "",
  VITE_ACCESS_CODE: "",
  VITE_API_BASE_URL: "",
};

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 1 : 0,
  reporter: IS_CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm dev --port ${E2E_PORT} --strictPort`,
    url: `http://localhost:${E2E_PORT}`,
    reuseExistingServer: !IS_CI,
    timeout: 120_000,
    // Merged OVER the inherited process.env — empty strings override any
    // developer .env/shell values (see determinism note above).
    env: KEYLESS_ENV,
  },
});
