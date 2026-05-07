export type Tone = "formal" | "casual" | "slang";

export interface DialectOption {
  value: string;
  label: string;
  character: string;
  available: boolean;
}

export const DIALECTS: DialectOption[] = [
  { value: "Cantonese", label: "Cantonese", character: "粵", available: true },
  { value: "Hokkien",   label: "Hokkien",   character: "閩", available: false },
  { value: "Hakka",     label: "Hakka",     character: "客", available: false },
  { value: "Teochew",   label: "Teochew",   character: "潮", available: false },
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

export type WorkJobTitle = typeof WORK_JOB_TITLES[number];

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
}

export interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
  suggestions?: Phrase[];
  cantoneseText?: string;
  pronunciation?: string;
  context?: string;
  phraseId?: string;
  englishTranslation?: string;
  audioDataUrl?: string;
  audioDataUrls?: string[];
  rating?: "up" | "down";
}

export interface Session {
  id: string;
  title?: string;
  date: string;
  messages: Message[];
  persona?: PersonaType;
  tags?: string[];
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
}

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
}

export interface TranslationVariant {
  text: string;
  pronunciation: string;
}

export interface TranslationResult {
  formal: TranslationVariant;
  casual: TranslationVariant;
  slang: TranslationVariant;
  predictedResponse: string;
  context: string;
}
