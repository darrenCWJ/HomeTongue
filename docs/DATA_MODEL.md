# Data model

All domain types live in `src/types.ts`. Persistence is Dexie (IndexedDB), DB name `hometongue`, schema versions 1–5 in `src/repositories/local/db.ts`.

## Tables

| Table | Key | Type | Notes |
|---|---|---|---|
| `phrases` | `id` | `Phrase` | saved/bookmarkable translations; may embed audio data-URLs |
| `sessions` | `id` | `Session` | saved chat conversations; sorted by ISO `createdAt` (fallback: parsed `date`) |
| `profile` | `key = "singleton"` | `UserProfile` | one local user; multi-user arrives with Supabase (Phase 3) |
| `lessonProgress` | `lessonId` | `LessonProgress` | completed levels per static lesson |
| `conversationLessons` | `id` (index: `sessionId`) | `ConversationLesson` | lessons generated from saved sessions, incl. exam stats |
| `draftMessages` | `key = "draft"` | `{ messages }` | autosaved unsent chat (restored on reload) |
| `tags` | `id` (index: `type`) | `Tag` | `type: "phrase" | "session"`; seeded with 9 defaults |

## Core types (abridged)

```ts
interface Phrase {
  id: string;               // newId() UUID
  original: string;         // English
  dialect: string;          // Traditional Chinese
  pronunciation: string;    // Jyutping
  isBookmarked: boolean;
  context: string;
  audioDataUrl?: string;    // base64 MP3/WAV — moves to object storage in Phase 3
  audioDataUrls?: string[];
  tags?: string[];          // Tag ids
  createdAt?: string;       // ISO
}

interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
  suggestions?: Phrase[];       // AI reply chips
  cantoneseText?: string;
  pronunciation?: string;
  englishTranslation?: string;
  audioDataUrl?: string;
  rating?: "up" | "down";       // future ML preference signal
  phraseId?: string;
}

interface Session {
  id: string;
  title?: string;
  date: string;        // locale display string (legacy)
  createdAt?: string;  // ISO — authoritative sort key
  messages: Message[];
  persona?: "personal" | "work";
  tags?: string[];
}

interface UserProfile {
  id: string;
  name: string;
  preferredDialect: string;       // "Cantonese"
  preferredTone: "formal" | "casual" | "slang";
  toneOverrideEnabled: boolean;
  activePersona?: "personal" | "work";
  personaProfiles?: Partial<Record<PersonaType, PersonaProfile>>; // tone, jobTitle, summary, phrases
  preferredVoiceId?: string;      // resolved via asVoiceKey()
  suggestedRepliesEnabled?: boolean;
  tourCompleted?: Partial<Record<TourPageId, boolean>>;
  // ...timestamps, personality notes
}

interface ConversationLesson {
  id: string;
  sessionId: string;
  title: string;
  vocabulary: VocabItem[];   // english / cantonese / jyutping / audio / breakdown
  examBestScore?: number;
  examCompleted: boolean;
  examAttempts: number;
  currentPhase?: "listen" | "flashcard" | "done";
}
```

## Conventions

- **IDs**: always `newId()` (`src/utils/id.ts`, `crypto.randomUUID`). Never `Date.now()`.
- **Schema changes**: bump the Dexie version in `db.ts` with an `.upgrade()` migration; never mutate an existing version block.
- **Repository access only**: pages/context never touch `db` directly except the draft-message autosave in `AppContext` (known exception).

## Planned cloud schema (Phase 3 — Supabase)

Every table gains `user_id uuid` (FK → `auth.users`) with RLS `user_id = auth.uid()`; audio moves to a Storage bucket with `audio_url` references; `messages` becomes its own table (FK → `sessions`) instead of an embedded array. ML tables `speech_samples` and `corrections` are specified in `docs/IMPROVEMENT_PLAN.md` Phase 6.
