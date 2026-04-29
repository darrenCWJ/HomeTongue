# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev                    # start dev server
pnpm build                  # production build (output: dist/)
pnpm generate:previews      # pre-generate Google TTS voice preview audio files
```

No test runner or lint script is configured.

## Environment Variables

Copy `.env.example` to `.env` and set:

| Variable | Purpose | Default |
|---|---|---|
| `VITE_ACCESS_CODE` | App entry gate (leave unset for open access) | unset |
| `VITE_OPENAI_API_KEY` | OpenAI – translation, suggestions, persona, Whisper STT | required |
| `VITE_OPENAI_MODEL` | OpenAI model override | `gpt-4o-mini` |
| `VITE_ELEVEN_LABS_API` | ElevenLabs – STT (scribe_v1) and voice cloning only | required for STT |
| `VITE_GOOGLE_API_JSON` | Google Cloud service account JSON (stringified) for TTS | required for TTS |
| `VITE_STORAGE_MODE` | `"local"` (IndexedDB) or `"cloud"` | `"local"` |

`VITE_GOOGLE_API_JSON` must be the full service account JSON as a single-line string. The app signs JWTs client-side using `crypto.subtle` to exchange for OAuth2 access tokens.

## Architecture

**Stack**: React 18 + TypeScript, Vite 6, Tailwind CSS v4, shadcn/ui (Radix UI primitives), pnpm.

### Data flow

```
src/types.ts                        ← shared domain types (Phrase, Message, Session, UserProfile, Lesson*, ConversationLesson)
src/app/context/AppContext.tsx       ← single global React context; all app state lives here
src/repositories/                   ← repository pattern for persistence
  interfaces.ts                     ← IPhraseRepository, IConversationRepository, IUserRepository, ILessonRepository, IConversationLessonRepository
  index.ts                          ← factory: picks local vs cloud impl based on VITE_STORAGE_MODE
  local/db.ts                       ← Dexie (IndexedDB) schema; DB name: "hometongue", v1 + v2
  local/LocalRepositories.ts        ← Dexie implementations
  cloud/CloudRepositories.ts        ← stub cloud implementations (not yet functional)
src/services/
  translationService.ts             ← OpenAI chat completions (EN→Cantonese, 3 tones) + Whisper STT; falls back to mock
  personaService.ts                 ← OpenAI persona summary built from chat history
  suggestionService.ts              ← AI phrase suggestions based on conversation context + user persona
src/hooks/
  useGoogleTTS.ts                   ← PRIMARY TTS: Google Cloud Chirp 3 HD voices for Cantonese (yue-HK); handles JWT signing and OAuth2
  useElevenLabs.ts                  ← STT via ElevenLabs scribe_v1, voice cloning, useAudioRecorder hook, blobToDataUrl utility
src/data/lessons.ts                 ← static lesson content
```

### TTS split

TTS and STT are handled by separate providers:
- **TTS** → `useGoogleTTS.ts`. Voices are `GOOGLE_TTS_VOICES` (Chirp 3 HD, yue-HK). `VoiceKey` selects a voice; `DEFAULT_VOICE = "zephyr"`. Call `speakText(text, voiceKey)` or `speakTextAndCapture(text, voiceKey)`.
- **STT** → `useElevenLabs.ts` (`transcribeAudio` using scribe_v1) and `translationService.ts` (`transcribeCantonese` / `transcribeEnglish` using Whisper).
- `useElevenLabs.ts` also exports `useAudioRecorder` (browser MediaRecorder) and `blobToDataUrl` (imported by useGoogleTTS).

### Persona system

Each `UserProfile` has two personas: `"personal"` and `"work"`. `activePersona` is stored on the profile. Each persona has its own `PersonaProfile` (tone, jobTitle, personaSummary, characteristicPhrases). `tone` in `AppContext` resolves as: active persona profile tone → profile preferredTone → `"casual"`. Persona summaries are regenerated in the background whenever a session is saved or discarded (`updatePersonaInBackground`).

### Routing

Four routes under a shared `Layout` wrapper (`src/app/routes.tsx`):
- `/` → `ChatPage` – main translation/conversation interface
- `/learn` → `LearnPage` – structured lessons + conversation lessons from chat history
- `/bookmarks` → `BookmarksPage` – saved phrases with category filters
- `/profile` → `ProfilePage` – user settings, persona management, voice selection

### UI components

`src/app/components/ui/` is the shadcn/ui component library — do not modify generated files there. Custom application components live in `src/app/components/`.

### Path alias

`@` resolves to `src/`. Figma asset imports (`figma:asset/<file>`) resolve to `src/assets/`.

### Adding a new page

1. Create the component in `src/app/pages/`.
2. Add the route in `src/app/routes.tsx`.
3. If the page needs persisted data, add an interface to `src/repositories/interfaces.ts`, implement it in both `local/` and `cloud/`, and wire it in `src/repositories/index.ts`.
4. Expose state via `AppContext` if it needs to be shared across pages.
