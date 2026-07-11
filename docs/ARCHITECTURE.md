# Architecture

## Big picture

```
┌─────────────────────────────────────────────┐
│  Browser / Capacitor WebView (React + Vite) │
│                                             │
│  features ─> context providers ─> repositories ─> Dexie (IndexedDB)
│    │                                        │
│    └──> services / hooks ──> src/lib/api.ts │
└──────────────────────┬──────────────────────┘
                       │  fetch /api/* (same origin on web,
                       │  VITE_API_BASE_URL on native)
┌──────────────────────▼──────────────────────┐
│  Vercel serverless functions (api/)         │
│   chat.js ───────> OpenAI chat completions  │
│   transcribe.js ─> OpenAI audio STT         │
│   tts.js ────────> Google Cloud TTS (JWT    │
│                    signed server-side)      │
└─────────────────────────────────────────────┘
```

Secrets (`OPENAI_API_KEY`, `GOOGLE_API_JSON`) exist only in the serverless environment. In development, `vite.config.ts` registers middleware that mirrors the three functions so `pnpm dev` behaves the same for the happy path — but the production hardening (rate limits, allowlists, size caps) exists only in `api/*.js`; verify those against a preview deploy.

## Frontend layers

| Layer | Location | Responsibility |
|---|---|---|
| Pages | `src/app/pages/` | Thin re-exports for Chat/Learn/Bookmarks + real screens for Profile and the gate chain (SignIn, Auth, Onboarding) |
| Features | `src/features/{chat,learn,bookmarks}/` | The three main product surfaces, decomposed into per-feature components/hooks (largest file < 700 lines) |
| Components | `src/app/components/` | Layout with bottom nav + gate chain, LanguageFilter, guided tour (`tour/`) |
| State | `src/app/context/` | Three memoized domain providers, nested `ProfileProvider > LibraryProvider > ChatProvider`; consume via `useProfile` / `useLibrary` / `useChat` (narrowest hook that has what you need) |
| Services | `src/services/` | AI features over `/api/chat` + `/api/transcribe`: translation (3 tones), transcription with hallucination guard, scoring, word breakdown, personas, suggestions. Each has an offline fallback. |
| Hooks | `src/hooks/` | `useGoogleTTS` (TTS + voice registry + `asVoiceKey`), `audio.ts` (recorder with unmount cleanup, WAV encoder, playback) |
| Persistence | `src/repositories/` | Repository pattern; `index.ts` factory picks local (Dexie) or cloud (Supabase + RLS) via `VITE_STORAGE_MODE`; cloud requires configured Supabase and falls back to local with a warning |
| Cloud (optional) | `src/lib/supabase.ts`, `authGateway.ts`, `AuthProvider` | Config-gated on `VITE_SUPABASE_URL/ANON_KEY`; statically eliminated from the bundle in local mode (see the gating invariant in CLAUDE.md) |
| Lib | `src/lib/api.ts` | The only module that knows the API base URL; `postJson` + typed `ApiError` |
| Utils | `src/utils/` | `id.ts` (UUID `newId()`), `vocab.ts` (chat → vocab extraction), `voicePreviewCache.ts` |

## Request flows

**Speak English → hear Cantonese** (ChatPage):
1. `useAudioRecorder.startRecording()` (MediaRecorder)
2. stop → blob → `blobToWav` → base64 → `POST /api/transcribe` (`language: "en"`)
3. transcript → `translate()` → `POST /api/chat` with the 3-tone system prompt → `TranslationResult`
4. chosen tone's text → `speakTextAndCapture()` → `POST /api/tts` → MP3 blob → play + cache data-URL on the message
5. background: `getSuggestions()` → `/api/chat`; suggestions render as tappable chips with prefetched TTS

**Exam scoring** (LearnPage exam view):
1. record → `transcribeCantonese` (with anti-hallucination prompt; falls back to `transcribeAnyLanguage` when no CJK is detected)
2. `scoreCantoneseAccuracy(expected, actual)` → `/api/chat` grading rubric; offline fallback is a character-match score with Mandarin↔Cantonese equivalence maps

**Session → conversation lesson** (BookmarksPage):
`extractVocabFromMessages` pulls Cantonese/English pairs from a saved session into `ConversationLesson.vocabulary`, which LearnPage renders as flashcards + exam.

## API endpoint contracts

| Endpoint | Body | Returns | Guards |
|---|---|---|---|
| `POST /api/chat` | `{ messages, temperature?, max_tokens?, response_format? }` | `{ content }` | ≤20 messages, ≤24k chars, max_tokens ≤2000, 60 req/min/IP |
| `POST /api/transcribe` | `{ audio: base64-wav, model?, language?, prompt? }` | `{ text }` | ≤4MB audio, model/language allowlists, 30 req/min/IP |
| `POST /api/tts` | `{ text, voiceName, languageCode }` | `{ audioContent: base64-mp3 }` | ≤500 chars, `yue-HK` + Chirp3-HD voice pattern only, 30 req/min/IP |

Rate limiting is per-instance in-memory (resets on cold start) — durable limiting is Phase 1 roadmap work.

## Persistence (Dexie, DB `hometongue`)

Versions 1–5; tables: `phrases`, `sessions`, `profile` (singleton row), `lessonProgress`, `conversationLessons`, `draftMessages` (chat draft autosave), `tags`. See `docs/DATA_MODEL.md`.

## Cloud mode (Supabase, optional)

When `VITE_SUPABASE_URL/ANON_KEY` + `VITE_STORAGE_MODE=cloud` are set: real email auth (guest still local-only), per-user Postgres tables behind Row-Level Security (`supabase/migrations/0001`), a one-way local→cloud import from Profile, and the consent-gated ML data pipeline (`0002`, `docs/ML_PIPELINE.md`). Every cloud code path is statically eliminated from local-mode bundles — the gate pattern is documented in `src/lib/authGateway.ts` and CLAUDE.md.

## Language packs (`src/languages/`)

Everything dialect-specific lives in a `LanguagePack` (contract in `src/languages/types.ts`):

- `tts` — Google TTS `languageCode`, the voice registry, default voice, legacy ElevenLabs ID map
- `stt` — transcription language hint + hallucination-guard prompt
- `prompts` — system prompts for translation (3 tones), word breakdown, scoring rubric (builder fn), example meta
- `scoring` — character-equivalence map and interchangeable particle groups for the offline score

`src/languages/index.ts` is the registry: `LANGUAGE_PACKS`, `getLanguagePack(code)`, `DEFAULT_LANGUAGE`, and
`ACTIVE_LANGUAGE_PACK` (the resolved default — Cantonese, the only pack today). `useGoogleTTS` and
`translationService` read from the active pack and remain the stable façade, so pages/components never
import from `src/languages/` directly.

**To add a dialect**: create `src/languages/<code>/index.ts` exporting a pack that `satisfies LanguagePack`
(keep the voices map `as const` so voice keys stay a literal union), register it in `LANGUAGE_PACKS`, and
extend the server-side allowlists in `api/` — those stay hardcoded as the security boundary. Full per-user
language selection is the remainder of Phase 4.

## Known architectural debt (by design, tracked in the improvement plan)

- `saveAll` (clear + bulkPut) phrase writes — replaced by per-entity CRUD in Phase 3
- No `userId` on entities; profile singleton — Phase 3 (Supabase)
- Services bind statically to the single Cantonese pack (`ACTIVE_LANGUAGE_PACK`) — per-user language selection is the rest of Phase 4
- Base64 audio inside DB rows — Phase 3 (object storage)
