# HomeTongue — Improvement & Rebuild Plan

Status: living document. Phase 0 and Phase 1 were executed in the `overhaul/phase-0-1` branch (July 2026). Later phases are designed but not yet built.

## Where the product is going

1. **Multi-language / multi-dialect** — Cantonese today; Hokkien, Hakka, Teochew (and beyond) next.
2. **Real accounts** — proper login replacing the cosmetic client-side gate.
3. **Cloud persistence** — every phrase, session, lesson, and recording stored per-user in a real database.
4. **Mobile apps** — Capacitor Android exists; harden it and add iOS.
5. **Dialect-aware ML** — collect consented, labeled speech data so a small language model (SLM) or fine-tuned LLM can be trained to understand dialects better than off-the-shelf models.
6. **Server-side AI keys** — no billable credentials in the client bundle. *(done — Phase 1)*

## Honest critique of the codebase (as found)

| Problem | Severity | Status |
|---|---|---|
| OpenAI API key embedded in the shipped JS bundle (`VITE_` prefix) | CRITICAL | **Fixed** — proxied via `api/chat` + `api/transcribe`; key must still be **rotated** |
| `.env.txt` with live secrets not covered by `.gitignore` | CRITICAL | **Fixed** (gitignored); rotate keys regardless |
| "Auth" is a client-side localStorage flag; email login is a `setTimeout` | CRITICAL (if treated as security) | Documented as cosmetic; real auth in Phase 3 |
| `/test/exam` hidden route bypassed the gate and burned paid STT calls | HIGH | **Fixed** — removed |
| `api/tts` had no input caps, allowlist, or rate limiting | HIGH | **Fixed** — hardened all three functions |
| Vulnerable deps (vite < 6.4.3, react-router < 7.15) | HIGH | **Fixed** — updated |
| No tsconfig, no type-checking, no `@types/react` — strict mode never ran | HIGH | **Fixed** — 0 errors under strict |
| Mic stream leaked if user navigated mid-recording; mic button stuck after permission denial | HIGH | **Fixed** |
| ~60 unused shadcn `ui/` files and ~48 unused npm deps (two full UI systems shipped) | MEDIUM | **Fixed** — deleted; 12 runtime deps remain |
| God components: LearnPage 2288 / ChatPage 1318 / BookmarksPage 1231 lines | HIGH (maintainability) | Phase 2 |
| Single 40-member AppContext re-rendering everything on any change | MEDIUM | Phase 2 |
| `Date.now()` IDs (collision-prone, unsyncable) | MEDIUM | **Fixed** — `newId()` (UUID) |
| Sessions sorted lexicographically by locale date string | MEDIUM | **Fixed** — ISO `createdAt` sort |
| Audio stored as base64 data-URLs inside DB rows | MEDIUM | Phase 3 (object storage) |
| No `userId` on any entity; profile is a singleton row | HIGH (blocks cloud) | Phase 3 |
| Cantonese hardcoded in every layer (voices, prompts, scoring maps) | HIGH (blocks goal 1) | Phase 4 |
| Capacitor calls relative `/api/*` (breaks native) | HIGH (blocks goal 4) | **Fixed** — `VITE_API_BASE_URL` + `src/lib/api.ts` |
| No tests, no lint, no CI | HIGH | Phase 1 (remaining) |

## Target architecture

- **Frontend**: React + Vite (unchanged), feature-folder structure, TanStack Query for server state, small contexts/Zustand for UI state, URL-driven navigation state.
- **Backend**: Vercel serverless functions (already started in `api/`). If long-running jobs appear (ML data processing, batch TTS), extract a small dedicated service later — the `/api` contract shields the client from that move.
- **Database + Auth + Storage**: **Supabase** (Postgres + GoTrue auth + S3-compatible storage + Row-Level Security). Rationale: one vendor covers goals 2, 3, and 5's storage needs; RLS gives per-user isolation with almost no server code; the repository interfaces already in the codebase map cleanly onto it. Alternatives considered: Firebase (worse relational fit, more lock-in), Neon + Clerk (more control, more glue code — revisit if Supabase Auth becomes limiting).
- **Mobile**: Capacitor (already present) for Android + iOS from the same web bundle; platform audio APIs behind interfaces.
- **ML data**: dedicated `speech_samples` / `corrections` tables + audio bucket, opt-in consent flags, export tooling for fine-tuning corpora.

---

## Phase 0 — Hygiene & guardrails ✅ (this branch)

- [x] `tsconfig.json` (strict) + `@types/react` + `pnpm typecheck` → 0 errors
- [x] Rename package (`hometongue`), real README, rewritten CLAUDE.md, this plan, `docs/`
- [x] `.gitignore` covers all `.env*` variants (except `.env.example`), screenshots, Android build output
- [x] Delete dead code: shadcn `ui/` tree, `figma/`, `storage.ts`, `ExamTestPage` + route, unused service functions
- [x] Remove 48 unused dependencies (MUI + Emotion, Radix set, two carousels, react-dnd, recharts, …) → 12 runtime deps
- [x] Update vulnerable deps (vite ≥ 6.4.3, react-router ≥ 7.15)
- [x] Route-level code splitting + vendor chunks (main bundle 735 kB → ~266 kB, all chunks < 300 kB)
- [x] Bug fixes: mic stuck-state, mic stream leak on unmount, stale suggestions after New Chat, session sort order, UUID IDs, defensive JSON parsing, load-failure logging
- [x] Android: `allowBackup=false`

## Phase 1 — Secrets server-side + quality gates (✅ proxies done; CI remaining)

- [x] `api/chat.js`, `api/transcribe.js` proxies; `api/tts.js` hardened (caps, allowlists, per-IP rate limit, sanitized errors)
- [x] Client services rewritten to call `/api/*` via `src/lib/api.ts`; zero secrets in bundle (verified by grepping `dist/`)
- [x] Dev middleware in `vite.config.ts` mirrors all three endpoints
- [x] CSP tightened: `connect-src 'self'`, `script-src 'self'` (no unsafe-inline)
- [ ] **ROTATE the OpenAI key** — the old one shipped in previously deployed bundles (manual step, do immediately)
- [ ] Set `OPENAI_API_KEY`, `OPENAI_MODEL`, `GOOGLE_API_JSON` in Vercel project env; delete `VITE_OPENAI_API_KEY` / `VITE_ELEVEN_LABS_API` / `VITE_GOOGLE_API_JSON`
- [ ] Vitest + React Testing Library; characterization tests for pure logic first (`utils/vocab`, `charMatchScore`, `isPromptHallucination`, `asVoiceKey`)
- [ ] ESLint (typescript-eslint) + Prettier
- [ ] GitHub Actions: typecheck → lint → test → build on every PR
- [ ] Durable rate limiting (Upstash Redis or Vercel KV-equivalent) replacing the in-memory limiter

## Phase 2 — Decompose god components

Do this only after tests exist (Phase 1) so refactors are safe.

1. **LearnPage** → `features/learn/{roadmap,flashcards,conversation-lesson,exam}/`; extract `useRecorder`, `useExamScoring`; move the `view` state into the URL (`/learn/:lessonId/exam` etc.) for deep links and back-button support.
2. **ChatPage** → extract `useTranslationFlow`, `useMicRecording`, `useSessionSave`, `useTagEditor` hooks; sheets/dialogs into components. Target < 300 lines per file.
3. **BookmarksPage** → filter bar, tag CRUD, phrase card, session list components.
4. Split `AppContext` into `ProfileProvider`, `ChatProvider`, `LibraryProvider` (phrases/tags/sessions) or adopt TanStack Query per domain; memoize provider values.
5. Enforce the 800-line file cap in CI once the split is done.

## Phase 3 — Real auth + cloud database (Supabase)

1. Schema (all tables: `user_id uuid` FK → `auth.users`, UUID PKs, RLS `user_id = auth.uid()`):
   `profiles`, `persona_profiles`, `phrases`, `sessions`, `messages`, `tags`, `phrase_tags`, `session_tags`, `conversation_lessons`, `lesson_progress`.
2. **Audio out of rows**: Supabase Storage bucket `recordings/`; rows keep `audio_url` + duration. Migration utility converts existing base64 data-URLs.
3. Implement `SupabaseRepositories` behind the existing `repositories/interfaces.ts`; replace the throwing cloud stubs; per-entity CRUD replaces `saveAll` (clear + bulkPut).
4. Supabase Auth: email magic-link + Google OAuth. Replace `SignInPage`/`AuthPage` gates; sessions via the Supabase client, not localStorage booleans. Keep the access code as an optional server-validated invite code.
5. One-time local→cloud import for existing IndexedDB users; keep Dexie as an offline cache layer (repository decorator) for mobile.
6. Gate `/api/chat|transcribe|tts` on a verified Supabase JWT → per-user rate limits and usage tracking.

## Phase 4 — Multi-language architecture

1. `LanguagePack` contract in `src/languages/`:
   ```ts
   interface LanguagePack {
     code: string;              // "yue-HK"
     label: string;             // "Cantonese"
     ttsVoices: Record<string, VoiceDef>;
     sttLanguage: string;       // hint for /api/transcribe
     sttPrompt?: string;        // hallucination-guard prompt
     romanization: { name: string; instruction: string };  // "Jyutping", …
     promptTemplates: { translate: string; breakdown: string; score: string };
     scoring: { charEquivalents: Record<string,string>; particleGroups: string[][] };
   }
   ```
2. Move everything Cantonese-specific out of `translationService.ts` / `useGoogleTTS.ts` into `languages/yue-HK/`; services take a `language` parameter.
3. Server endpoints accept a `language` field validated against registered packs (voice allowlists come from the pack).
4. Lesson content becomes language-scoped (`data/lessons/<code>.ts`, later DB-backed so content ships without redeploys).
5. Prove it: add a second pack (e.g. Hokkien `nan-TW` if Google TTS supports it, else start with prompts + STT only) and flip `DIALECTS.available`.

## Phase 5 — Mobile hardening (Android now, iOS next)

1. Build Android against the deployed origin (`VITE_API_BASE_URL`) — plumbing already exists.
2. Verify on-device: mic permission flow, MediaRecorder mime types, AudioContext WAV conversion, TTS playback, safe-area insets.
3. Add a CSP `<meta>` tag variant for the webview build (HTTP-header CSP doesn't apply to local files) and `network_security_config.xml` (`cleartextTrafficPermitted=false`).
4. Offline-first: Dexie cache in front of Supabase repositories; queue writes when offline.
5. `npx cap add ios`; audio behaviors re-tested on WKWebView (AudioContext unlock requires a user gesture).
6. Store packaging: icons/splash, versioning, Play Console + TestFlight tracks.

## Phase 6 — Dialect ML data pipeline (SLM/LLM training)

Goal: a clean, consented, labeled corpus that can fine-tune Whisper-class STT or an SLM for dialect understanding.

1. **Consent first**: `dataCollectionConsent` + `audioRetentionConsent` flags (default OFF) with timestamps on the profile; Profile UI toggle; server refuses to persist samples without them.
2. **Collection points** (all already produce labeled pairs naturally):
   - Exam mode: `expected_text` + user audio + transcript + score → ideal supervised pairs.
   - Chat transcription + user corrections (`pendingEditText` edits are gold-label corrections).
   - Suggestion thumbs up/down (`Message.rating`) → preference data.
3. **Schema**: `speech_samples(id, user_id, language, expected_text, transcript, corrected_text, score, audio_url, model, device, created_at)`; `corrections(id, user_id, original, corrected, context, created_at)`.
4. **Export tooling**: script producing HF-datasets-compatible JSONL + audio manifests; PII scrub pass; per-user delete honoring consent withdrawal.
5. **Training path** (later): start with Whisper LoRA fine-tune on collected Cantonese audio for STT accuracy; evaluate an SLM (e.g. Qwen-class) fine-tuned on correction pairs for translation quality; serve behind `/api` exactly like OpenAI today so swapping models is invisible to the client.

## Cross-cutting

- Every phase lands via PR with typecheck + (from Phase 1) lint/test/build green.
- E2E (Playwright) for the four critical flows once auth is real: sign-in, translate-in-chat, save-session→lesson, exam scoring.
- Keep `vite.config.ts` dev middleware in sync with `api/` functions until a shared module is extracted.
