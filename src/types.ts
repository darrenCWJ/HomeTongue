import { LANGUAGE_PACKS } from "./languages";

export type Tone = "formal" | "casual" | "slang";

export interface DialectOption {
  value: string;
  label: string;
  character: string;
  available: boolean;
  /**
   * Selectable but text-only: the pack lacks TTS and/or STT models
   * (capabilities flags), so voice controls are hidden and pickers show an
   * "Experimental — text only" note.
   */
  experimental?: boolean;
}

/** Dialects on the roadmap that do not have a language pack yet. */
const UPCOMING_DIALECTS: DialectOption[] = [
  { value: "Hakka", label: "Hakka", character: "客", available: false },
  { value: "Teochew", label: "Teochew", character: "潮", available: false },
];

// Available dialects are derived from the language pack registry: registering
// a new pack in src/languages/index.ts surfaces it here (and in DialectSheet)
// automatically. `value` matches the pack label — resolveLanguagePackByLabel
// in src/languages/index.ts relies on that.
export const DIALECTS: DialectOption[] = [
  ...Object.values(LANGUAGE_PACKS).map((pack) => ({
    value: pack.label,
    label: pack.label,
    character: pack.character,
    available: true,
    experimental: !pack.capabilities.tts || !pack.capabilities.stt,
  })),
  ...UPCOMING_DIALECTS,
];

export type PersonaType = "personal" | "work";

export const WORK_JOB_TITLES = [
  "Nurse",
  "Doctor",
  "Teacher",
  "Engineer",
  "Retail Staff",
  "Construction Worker",
  "Driver",
  "Office Worker",
] as const;

export type WorkJobTitle = (typeof WORK_JOB_TITLES)[number];

export interface PersonaProfile {
  personaSummary?: string;
  characteristicPhrases?: string[];
  tone: Tone;
  jobTitle?: WorkJobTitle;
}

export type TagType = "phrase" | "session";

export interface Tag {
  id: string;
  name: string;
  type: TagType;
  createdAt: string;
}

export interface Phrase {
  id: string;
  original: string;
  dialect: string;
  pronunciation: string;
  isBookmarked: boolean;
  context: string;
  audioDataUrl?: string;
  audioDataUrls?: string[];
  tags?: string[];
  createdAt?: string;
  /** Language pack this phrase belongs to. Absent = legacy yue-HK data; see src/languages/scope.ts. */
  languageCode?: string;
}

export interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
  suggestions?: Phrase[];
  /** The message rendered in the active dialect (persisted; legacy records stored this as `cantoneseText`). */
  dialectText?: string;
  pronunciation?: string;
  context?: string;
  phraseId?: string;
  englishTranslation?: string;
  audioDataUrl?: string;
  audioDataUrls?: string[];
  rating?: "up" | "down";
  /** All register variants returned by translation, so the UI can switch formal/casual/slang after the fact. */
  variants?: MessageVariants;
  /** Model-predicted likely reply from the other speaker, in the dialect. */
  predictedResponse?: string;
}

export interface Session {
  id: string;
  title?: string;
  /** Display-formatted date (locale string) — kept for older records */
  date: string;
  /** ISO timestamp used for reliable sorting; older records may lack it */
  createdAt?: string;
  messages: Message[];
  persona?: PersonaType;
  tags?: string[];
  /** Language pack this session belongs to. Absent = legacy yue-HK data; see src/languages/scope.ts. */
  languageCode?: string;
}

export interface ConversationLesson {
  id: string;
  sessionId: string;
  title: string;
  createdAt: string;
  vocabulary: VocabItem[];
  examBestScore?: number;
  examCompleted: boolean;
  examAttempts: number;
  persona?: PersonaType;
  currentPhase?: "listen" | "flashcard" | "done";
  /** Language pack this lesson belongs to. Absent = legacy yue-HK data; see src/languages/scope.ts. */
  languageCode?: string;
}

export type TourPageId = "chat" | "learn" | "bookmarks" | "profile";

export interface UserProfile {
  id: string;
  name: string;
  preferredDialect: string;
  preferredTone: Tone;
  toneOverrideEnabled: boolean;
  personalityNotes: string;
  conversationCount: number;
  createdAt: string;
  updatedAt: string;
  personaSummary?: string;
  characteristicPhrases?: string[];
  activePersona?: PersonaType;
  personaProfiles?: Partial<Record<PersonaType, PersonaProfile>>;
  preferredVoiceId?: string;
  customVoiceId?: string;
  suggestedRepliesEnabled?: boolean;
  tourCompleted?: Partial<Record<TourPageId, boolean>>;
  /** ML data pipeline consent: text-level data (transcripts, scores) may be stored. Default OFF. */
  dataCollectionConsent?: boolean;
  /** ML data pipeline consent: recordings may additionally be kept. Default OFF. */
  audioRetentionConsent?: boolean;
  /** ISO timestamp of the last consent change. */
  consentUpdatedAt?: string;
}

export interface WordChunk {
  characters: string;
  pronunciation: string;
  meaning: string;
}

export interface VocabItem {
  english: string;
  cantonese: string;
  pronunciation: string;
  exampleSentence?: string;
  audioDataUrl?: string;
  breakdown?: WordChunk[];
}

export type ExerciseType = "flashcard" | "matching" | "multiple-choice" | "fill-blank" | "conversation";

export interface ConversationTurn {
  speaker: "user" | "them";
  english: string;
  cantonese: string;
  pronunciation: string;
  hint?: string;
}

export interface LessonLevel {
  level: number;
  title: string;
  description: string;
  exerciseType: ExerciseType;
  vocabulary: VocabItem[];
  conversation?: ConversationTurn[];
}

export interface LessonContent {
  vocabulary: VocabItem[];
  levels?: LessonLevel[];
}

export interface Lesson {
  id: string;
  categoryId: string;
  title: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  tags: string[];
  content: LessonContent;
}

export interface LessonCategory {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export interface LessonProgress {
  lessonId: string;
  completedLevels: number;
  totalLevels: number;
  lastAccessedAt: string;
  /**
   * Accuracy (0–100) of the most recent GRADED level attempt for this lesson.
   * Absent for lessons only practised through ungraded exercises (flashcards,
   * matching, conversation). Feeds the "Dialect Fluency" stat on LearnPage.
   */
  lastAccuracy?: number;
}

export interface TranslationVariant {
  text: string;
  pronunciation: string;
}

/** Register variants stored on a translated Message (one per tone). */
export interface MessageVariants {
  formal: TranslationVariant;
  casual: TranslationVariant;
  slang: TranslationVariant;
}

export interface TranslationResult {
  formal: TranslationVariant;
  casual: TranslationVariant;
  slang: TranslationVariant;
  predictedResponse: string;
  context: string;
}

/** Self-reported recall grade for a spaced-repetition review. */
export type ReviewGrade = "again" | "hard" | "good" | "easy";

/**
 * Spaced-repetition scheduling state for one saved phrase (SM-2-lite).
 * Persisted in the `reviewStates` Dexie table, keyed by phraseId.
 * Pure scheduling logic lives in src/features/learn/srs/scheduler.ts.
 */
export interface PhraseReviewState {
  phraseId: string;
  /** ISO timestamp when the phrase is next due for review. */
  due: string;
  /** Current inter-review interval in whole days (0 = new / relearning). */
  intervalDays: number;
  /** SM-2 ease factor; higher = easier. Clamped to [1.3, 3.0]. */
  ease: number;
  /** Consecutive successful reviews ("again" resets to 0). */
  reps: number;
  /** Times the phrase was forgotten after at least one successful review. */
  lapses: number;
  /** ISO timestamp of the last grading. */
  updatedAt: string;
}
