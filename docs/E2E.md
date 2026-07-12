# E2E Testing (Playwright)

Deterministic end-to-end tests for the critical user flows. The suite runs
locally and in CI with **zero external API keys** — no OpenAI, no Google
Cloud, no Supabase, no network calls beyond localhost.

## Running

```bash
pnpm e2e        # headless run (starts its own dev server on port 5199)
pnpm e2e:ui     # Playwright UI mode for debugging
npx playwright test e2e/theme.spec.ts   # a single spec
```

First-time setup: `pnpm install` then `npx playwright install chromium`
(CI uses `npx playwright install --with-deps chromium`).

The config (`playwright.config.ts`) declares a `webServer` that runs
`pnpm dev --port 5199 --strictPort`, so you never need to start a server
yourself. Locally an already-running server on 5199 is reused
(`reuseExistingServer`); in CI it is always started fresh.

## Determinism strategy

The app was designed with an offline fallback: when the server has no
OpenAI key, `/api/chat` returns **503** and the client falls back to the
deterministic mock translator (`translateWithMock` in
`src/services/translationService.ts`). Known inputs produce fixed Cantonese
output — e.g. `hello` → 喂，你好呀！ (casual), `thank you` → 唔該晒！ — with
fixed register variants and a fixed predicted reply.

The Playwright `webServer.env` therefore blanks **every** credential the
`api/_lib/*.js` cores read (`OPENAI_API_KEY`, `LLM_API_KEY`,
`VITE_OPENAI_API_KEY`, `GOOGLE_API_JSON`, `VITE_GOOGLE_API_JSON`,
`STT_API_KEY`, Upstash vars) plus the client flags
(`VITE_STORAGE_MODE=local`, blank `VITE_SUPABASE_*`, blank
`VITE_ACCESS_CODE`, blank `VITE_API_BASE_URL`).

Two details worth knowing:

- **Empty strings, not deletion.** Vite's `loadEnv` gives `process.env`
  priority over `.env` files. An empty-string override reliably masks a
  developer's real key in `.env`; deleting the variable would let the `.env`
  value leak back in and the suite would silently hit real APIs.
- **TTS/STT are down in this mode** (`/api/tts` returns 500). Specs never
  depend on audio. `prepareTranslation`
  (`src/features/chat/utils/prepareTranslation.ts`) deliberately degrades a
  TTS failure to silent no-op audio instead of discarding the translation —
  the same contract voice-less language packs get.

Persistence is local IndexedDB (Dexie). Every Playwright test runs in a
fresh browser context, i.e. a clean database and clean localStorage — tests
are fully independent and run in parallel.

## What each spec covers

| Spec | Asserts |
|---|---|
| `onboarding.spec.ts` | Fake email gate → name → voice picker (Female tab: Jamie/Sarah/Lucy; Male tab: Tom/John/Harry) → persona → Get Started → chat page with the Dialect/Type/Non-Dialect action bar |
| `chat-translate.spec.ts` | Type "hello" → deterministic mock Cantonese output, Formal/Casual/Slang register chips (switching swaps the variant), "They might reply" hint |
| `dialect-switch.spec.ts` | Dialect sheet: Hokkien "Experimental — text only", Hakka/Teochew "Coming soon" + disabled; selecting Hokkien updates the header, hides the Dialect mic, shows the "Voice input coming soon" pill; switching back restores it |
| `learn.spec.ts` | Four Cantonese lesson categories + "Practice my phrases" + roleplay card; Hokkien filter swaps to "Hokkien Basics" (roleplay stays — the nan-TW pack registers scenarios too) |
| `theme.spec.ts` | Profile → Appearance → Dark: `.dark` on `<html>`, body renders the dark `--background` token, persists across reload, Light reverts |
| `bookmarks.spec.ts` | Translate → Save Conversation → session listed under Saved → Conversations; Hokkien language filter hides the Cantonese session, switching back restores it |

## Conventions for new specs

- **Drive the real onboarding via `onboardToChat(page)`** (`e2e/helpers.ts`)
  rather than seeding localStorage/IndexedDB. The profile lives in a
  schema-versioned Dexie database; hand-seeded rows would rot on the next
  migration, while the UI path stays valid. It costs ~3s per test.
- **Skip tours deterministically.** Each page's feature tour auto-starts
  ~600ms after its first visit. Use `skipTour(page)` /
  `gotoTabFirstVisit(page, tab)` — they wait for the tour dialog and click
  its Skip button.
- **Web-first assertions only.** No `waitForTimeout`. `expect(...).toBeVisible()`
  polls through framer-motion animations, and Playwright's actionability
  checks wait for elements to stop moving before clicking.
- **Stick to mock-translator inputs** (`hello`, `thank you`, `sorry`,
  `how much`, `station`, `food` — see `translateWithMock`). Anything else
  echoes the input back, which is still deterministic but less interesting.
- **Name files `e2e/<flow>.spec.ts`.** Vitest's include globs
  (`vitest.config.ts`) do not match `e2e/`, and Playwright's `testDir` is
  `e2e/`, so the two runners never pick up each other's tests. Keep it that
  way: unit tests are `*.test.ts`, E2E specs are `e2e/*.spec.ts`.
- The suite is typechecked (`tsconfig.json` includes `e2e/` and
  `playwright.config.ts`) and linted; run `pnpm typecheck && pnpm lint`
  before committing.

## CI

`.github/workflows/ci.yml` has a dedicated `e2e` job (separate from the
fast `verify` gates): pnpm install → `npx playwright install --with-deps
chromium` → `pnpm e2e`. On failure the HTML report is uploaded as the
`playwright-report` artifact. In CI, `retries: 1` with `trace:
"on-first-retry"` captures a trace for any retried test.
