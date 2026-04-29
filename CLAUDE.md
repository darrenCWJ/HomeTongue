# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev        # start dev server
pnpm build      # production build (output: dist/)
```

No test runner or lint script is configured yet.

## Environment Variables

Copy `.env` and set:

| Variable | Purpose | Default |
|---|---|---|
| `VITE_OPENAI_API_KEY` | OpenAI – translation & Whisper STT | required |
| `VITE_OPENAI_MODEL` | OpenAI model override | `gpt-4o-mini` |
| `VITE_ELEVEN_LABS_API` | ElevenLabs TTS | required |
| `VITE_STORAGE_MODE` | `"local"` (IndexedDB) or `"cloud"` | `"local"` |

## Architecture

**Stack**: React 18 + TypeScript, Vite 6, Tailwind CSS v4, shadcn/ui (Radix UI primitives), pnpm.

### Data flow

```
src/types.ts          ← shared domain types (Phrase, Message, Session, UserProfile, Lesson*)
src/app/context/AppContext.tsx  ← single global React context; all app state lives here
src/repositories/     ← repository pattern for persistence
  interfaces.ts       ← IPhraseRepository, IConversationRepository, IUserRepository, ILessonRepository
  index.ts            ← factory: picks local vs cloud impl based on VITE_STORAGE_MODE
  local/              ← Dexie (IndexedDB) implementations; DB name: "hometongue"
  cloud/              ← stub cloud implementations
src/services/         ← external API calls
  translationService.ts  ← OpenAI chat completions (EN→Cantonese) + Whisper STT; falls back to mock
  personaService.ts      ← OpenAI persona summary built from chat history
  suggestionService.ts   ← phrase suggestions
src/hooks/useElevenLabs.ts  ← TTS (eleven_multilingual_v2) + browser MediaRecorder for STT
src/data/lessons.ts   ← static lesson content
```

### Routing

Four routes under a shared `Layout` wrapper (`src/app/routes.tsx`):
- `/` → `ChatPage` – main translation/conversation interface
- `/learn` → `LearnPage` – structured lessons
- `/bookmarks` → `BookmarksPage` – saved phrases
- `/profile` → `ProfilePage` – user settings & persona summary

### UI components

`src/app/components/ui/` is the shadcn/ui component library — do not modify generated files there. Custom application components live in `src/app/components/`.

### Path alias

`@` resolves to `src/`. Figma asset imports (`figma:asset/<file>`) resolve to `src/assets/`.

### Adding a new page

1. Create the component in `src/app/pages/`.
2. Add the route in `src/app/routes.tsx`.
3. If the page needs persisted data, add an interface to `src/repositories/interfaces.ts`, implement it in both `local/` and `cloud/`, and wire it in `src/repositories/index.ts`.
4. Expose state via `AppContext` if it needs to be shared across pages.
