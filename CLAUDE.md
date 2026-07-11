# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev                    # start dev server (includes /api/* middleware — see vite.config.ts)
pnpm build                  # production build (output: dist/)
pnpm typecheck              # tsc --noEmit (strict mode) — run before committing
pnpm generate:previews      # pre-generate Google TTS voice preview audio files
pnpm android:sync           # build web assets and sync into the Capacitor Android project
```

No test runner or lint script is configured yet (see docs/IMPROVEMENT_PLAN.md Phase 1).

## Environment Variables

Copy `.env.example` to `.env`. Secrets are **server-side only** — the client never sees them.

| Variable | Side | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | server | translation, suggestions, persona, speech-to-text (via `/api/chat`, `/api/transcribe`) |
| `OPENAI_MODEL` | server | model override (default `gpt-4o-mini`) |
| `GOOGLE_API_JSON` | server | Google Cloud service-account JSON (single-line) for Chirp 3 HD TTS via `/api/tts` |
| `VITE_ACCESS_CODE` | client | soft entry gate — ships in the bundle, NOT a security boundary; unset = open access |
| `VITE_STORAGE_MODE` | client | `"local"` (IndexedDB, default) or `"cloud"` (stub, not implemented) |
| `VITE_API_BASE_URL` | client | base origin for `/api/*` calls — leave unset on web; REQUIRED for Capacitor builds (set to the deployed origin) |

Legacy `VITE_OPENAI_API_KEY` / `VITE_GOOGLE_API_JSON` names are still read as fallbacks by the server code, but never referenced from client code. Never put a real secret in a `VITE_`-prefixed variable — Vite inlines those into the public JS bundle.

## Architecture

**Stack**: React 18 + TypeScript (strict), Vite 6, Tailwind CSS v4, pnpm, Dexie (IndexedDB), Capacitor 8 (Android), Vercel serverless functions.

### API layer (server-side proxies)

All third-party AI calls go through serverless functions in `api/` so keys stay server-side:

```
api/chat.js        ← OpenAI chat completions proxy (translation, suggestions, persona, scoring)
api/transcribe.js  ← OpenAI audio transcription proxy (accepts base64 WAV JSON body)
api/tts.js         ← Google Cloud Chirp 3 HD TTS proxy (signs SA JWT server-side)
```

Each function validates input (length caps, model/voice allowlists) and applies best-effort per-IP rate limiting. `vite.config.ts` contains dev middleware mirroring all three endpoints so `pnpm dev` works identically — **keep them in sync when changing an endpoint**. Note: the dev middleware only mirrors the happy path and missing-key errors; the hardening guards (rate limits, allowlists, size caps) are production-only, so test those against a preview deploy.

The client reaches these via `src/lib/api.ts` (`apiUrl()` / `postJson()`), which prefixes `VITE_API_BASE_URL` for native builds.

### Data flow

```
src/types.ts                        ← shared domain types (Phrase, Message, Session, UserProfile, Lesson*, ConversationLesson, Tag)
src/app/context/                     ← three memoized domain providers, nested Profile > Library > Chat
  ProfileProvider.tsx                ← useProfile: userProfile, persona, tone, sign-in, dialect
  LibraryProvider.tsx                ← useLibrary: phrases, tags, sessions, conversation lessons, progress
  ChatProvider.tsx                   ← useChat: messages, draft autosave, saveSession/discardChat compositions
src/features/                        ← the three product surfaces (chat/, learn/, bookmarks/), decomposed;
                                       src/app/pages/* for these are one-line re-exports
src/languages/                       ← LanguagePack contract + yue-HK pack (voices, prompts, scoring maps);
                                       useGoogleTTS/translationService are the stable façades over the active pack
src/repositories/                   ← repository pattern for persistence
  interfaces.ts                     ← I*Repository interfaces
  index.ts                          ← factory: local vs cloud impl based on VITE_STORAGE_MODE
  local/db.ts                       ← Dexie schema; DB name "hometongue", versions 1–5
  local/LocalRepositories.ts        ← Dexie implementations
  cloud/CloudRepositories.ts        ← stub cloud implementations (throw; not functional)
src/services/
  translationService.ts             ← translation, transcription, scoring, word breakdown (all via /api proxies; offline mock fallback when server unconfigured)
  personaService.ts                 ← persona summary from chat history (via /api/chat)
  suggestionService.ts              ← AI reply suggestions (via /api/chat)
src/hooks/
  useGoogleTTS.ts                   ← TTS: Chirp 3 HD voices (yue-HK); speakText / speakTextAndCapture / asVoiceKey
  audio.ts                          ← useAudioRecorder (MediaRecorder + unmount cleanup), playDataUrl, blobToWav, blobToDataUrl
src/lib/api.ts                      ← apiUrl / postJson / ApiError — the only place that knows the API base URL
src/utils/id.ts                     ← newId() — crypto.randomUUID-based IDs; use this, never Date.now().toString()
src/utils/vocab.ts                  ← extract vocab items from chat messages
src/data/lessons.ts                 ← static lesson content (Cantonese)
```

### TTS / STT split

- **TTS** → `useGoogleTTS.ts` → `/api/tts`. Voices are `GOOGLE_TTS_VOICES` (Chirp 3 HD, yue-HK). `asVoiceKey()` safely resolves any stored voice ID (including legacy ElevenLabs IDs) to a valid `VoiceKey`. `DEFAULT_VOICE = "zephyr"`.
- **STT** → `translationService.ts` (`transcribeCantonese` / `transcribeEnglish` / `transcribeAnyLanguage`) → `/api/transcribe`. Audio is converted to WAV client-side (`blobToWav`) and sent as base64. `transcribeCantonese` includes a prompt-hallucination guard.
- ElevenLabs is no longer used anywhere.

### Auth & gating (IMPORTANT: cosmetic only)

`Layout.tsx` chains three client-side gates: `SignInPage` (access code compared against `VITE_ACCESS_CODE` in the bundle) → `AuthPage` (fake email form, no backend) → `OnboardingPage` (profile name). State lives in localStorage (`ht_signed_in`, `ht_email_authed`). None of this is real authentication — treat it as a demo veneer. Real auth is Phase 3 of the improvement plan.

### Persona system

Each `UserProfile` has two personas: `"personal"` and `"work"` (`activePersona` on the profile). Each persona has its own `PersonaProfile` (tone, jobTitle, personaSummary, characteristicPhrases). `tone` resolves: active persona tone → profile preferredTone → `"casual"`. Persona summaries regenerate in the background on session save/discard (`updatePersonaInBackground`).

### Routing

`src/app/routes.tsx` — all under a shared `Layout`; non-index pages are lazy-loaded (route-level code splitting):

- `/` → `ChatPage` (eager) — live translation/conversation
- `/learn` → `LearnPage` — lessons + conversation lessons + exam mode
- `/bookmarks` → `BookmarksPage` — saved phrases with tag filters
- `/profile` → `ProfilePage` — settings, personas, voice selection

### Mobile (Capacitor)

`android/` is a Capacitor 8 Android project (`appId com.hometongue.app`, webDir `dist`). Build flow: `pnpm android:sync` then open in Android Studio. Native builds MUST set `VITE_API_BASE_URL` at build time or all `/api/*` calls fail (the webview has no origin).

### Path alias

`@` resolves to `src/`. Figma asset imports (`figma:asset/<file>`) resolve to `src/assets/`.

## Conventions

- Strict TypeScript everywhere; `pnpm typecheck` must pass (0 errors) before committing.
- Generate IDs with `newId()` from `src/utils/id.ts`.
- New persisted data: add an interface to `src/repositories/interfaces.ts`, implement in `local/` (and stub in `cloud/`), wire in `repositories/index.ts`, bump the Dexie version in `local/db.ts` with an upgrade function.
- Learn features live in `src/features/learn/` (decomposed; `src/app/pages/LearnPage.tsx` is a re-export). New learn work goes in the matching subfolder (`main/`, `roadmap/`, `exercises/`, `conversation-lesson/`, `exam/`), keeping files under 400 lines.
- All three main surfaces live in `src/features/{chat,learn,bookmarks}/` — new work goes in the matching feature folder, files under 400 lines preferred (800 hard cap).
- State: consume the narrowest context hook (`useProfile` / `useLibrary` / `useChat` from `src/app/context/`); new callbacks in providers must use `useCallback` with exhaustive deps and be added to the value `useMemo`.
- Language-specific data (prompts, voices, scoring maps) belongs in `src/languages/<code>/` — never inline dialect specifics in services or components.
- Run `pnpm typecheck && pnpm lint && pnpm test` before committing; CI enforces all three plus the build.
- The product roadmap (real auth, cloud DB, multi-language packs, ML data pipeline) lives in `docs/IMPROVEMENT_PLAN.md` — align new work with its phases.
