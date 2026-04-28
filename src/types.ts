export type Tone = "formal" | "casual" | "slang";

export interface Phrase {
  id: string;
  original: string;
  dialect: string;
  pronunciation: string;
  isBookmarked: boolean;
  context: string;
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
}

export interface Session {
  id: string;
  date: string;
  title?: string;
  messages: Message[];
}

export interface UserProfile {
  id: string;
  name: string;
  preferredDialect: string;
  preferredTone: Tone;
  personalityNotes: string;
  conversationCount: number;
  createdAt: string;
  updatedAt: string;
  personaSummary?: string;
  characteristicPhrases?: string[];
  preferredVoiceId?: string;
}

export interface VocabItem {
  english: string;
  cantonese: string;
  pronunciation: string;
  exampleSentence?: string;
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
