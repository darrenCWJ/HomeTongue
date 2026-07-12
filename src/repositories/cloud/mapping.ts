import type {
  ConversationLesson,
  LessonProgress,
  Message,
  PersonaProfile,
  PersonaType,
  Phrase,
  PhraseReviewState,
  Session,
  Tag,
  TagType,
  Tone,
  TourPageId,
  UserProfile,
  VocabItem,
} from "../../types";

// Pure row <-> domain mappers for the Supabase cloud repositories.
//
// Conventions:
//   * Rows use snake_case (Postgres), domain types use camelCase.
//   * Optional domain fields map to nullable row columns; `undefined` -> null
//     on the way out, and null columns are OMITTED from the domain object on
//     the way back so round-trips are exact (toStrictEqual-safe).
//   * These functions never touch the network — they exist so mapping logic
//     is unit-testable without a live Supabase project.

export interface PhraseRow {
  id: string;
  user_id: string;
  original: string;
  dialect: string;
  pronunciation: string;
  is_bookmarked: boolean;
  context: string;
  audio_data_url: string | null;
  audio_data_urls: string[] | null;
  tags: string[] | null;
  created_at: string | null;
  /** Null = legacy yue-HK data, mirroring the client's absent-field convention. */
  language_code: string | null;
}

/**
 * Message as it may appear in the sessions.messages jsonb column: rows written
 * before the dialect-neutral rename stored the dialect line under
 * `cantoneseText`. rowToSession normalizes it to `dialectText`, and
 * sessionToRow strips it so the legacy key is never written back.
 */
export type LegacyMessage = Message & { cantoneseText?: string };

export interface SessionRow {
  id: string;
  user_id: string;
  title: string | null;
  date_display: string;
  messages: LegacyMessage[];
  persona: PersonaType | null;
  tags: string[] | null;
  created_at: string | null;
  /** Null = legacy yue-HK data, mirroring the client's absent-field convention. */
  language_code: string | null;
}

export interface ProfileRow {
  user_id: string;
  name: string;
  preferred_dialect: string;
  preferred_tone: Tone;
  tone_override_enabled: boolean;
  personality_notes: string;
  conversation_count: number;
  persona_summary: string | null;
  characteristic_phrases: string[] | null;
  active_persona: PersonaType | null;
  persona_profiles: Partial<Record<PersonaType, PersonaProfile>> | null;
  preferred_voice_id: string | null;
  custom_voice_id: string | null;
  suggested_replies_enabled: boolean | null;
  tour_completed: Partial<Record<TourPageId, boolean>> | null;
  // ML data pipeline consent (migration 0002). Columns are NOT NULL DEFAULT
  // false, so `undefined` maps to false on the way out and false maps back to
  // an omitted domain field (absent ≡ not consented).
  data_collection_consent: boolean;
  audio_retention_consent: boolean;
  consent_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TagRow {
  id: string;
  user_id: string;
  name: string;
  type: TagType;
  created_at: string;
}

export interface ConversationLessonRow {
  id: string;
  user_id: string;
  session_id: string;
  title: string;
  vocabulary: VocabItem[];
  exam_best_score: number | null;
  exam_completed: boolean;
  exam_attempts: number;
  persona: PersonaType | null;
  current_phase: "listen" | "flashcard" | "done" | null;
  created_at: string;
  /** Null = legacy yue-HK data, mirroring the client's absent-field convention. */
  language_code: string | null;
}

export interface LessonProgressRow {
  user_id: string;
  lesson_id: string;
  completed_levels: number;
  total_levels: number;
  last_accessed_at: string;
  last_accuracy: number | null;
}

export interface ReviewStateRow {
  user_id: string;
  phrase_id: string;
  due: string;
  interval_days: number;
  ease: number;
  reps: number;
  lapses: number;
  updated_at: string;
}

export function phraseToRow(phrase: Phrase, userId: string): PhraseRow {
  return {
    id: phrase.id,
    user_id: userId,
    original: phrase.original,
    dialect: phrase.dialect,
    pronunciation: phrase.pronunciation,
    is_bookmarked: phrase.isBookmarked,
    context: phrase.context,
    audio_data_url: phrase.audioDataUrl ?? null,
    audio_data_urls: phrase.audioDataUrls ?? null,
    tags: phrase.tags ?? null,
    created_at: phrase.createdAt ?? null,
    language_code: phrase.languageCode ?? null,
  };
}

export function rowToPhrase(row: PhraseRow): Phrase {
  return {
    id: row.id,
    original: row.original,
    dialect: row.dialect,
    pronunciation: row.pronunciation,
    isBookmarked: row.is_bookmarked,
    context: row.context,
    ...(row.audio_data_url !== null ? { audioDataUrl: row.audio_data_url } : {}),
    ...(row.audio_data_urls !== null ? { audioDataUrls: row.audio_data_urls } : {}),
    ...(row.tags !== null ? { tags: row.tags } : {}),
    ...(row.created_at !== null ? { createdAt: row.created_at } : {}),
    ...(row.language_code !== null ? { languageCode: row.language_code } : {}),
  };
}

/**
 * Normalizes a persisted message to the current domain shape: a legacy
 * `cantoneseText` value moves to `dialectText` (an already-present
 * `dialectText` wins), and the legacy key is dropped. Messages without the
 * legacy key are returned structurally unchanged.
 */
function normalizeMessage(message: LegacyMessage): Message {
  const { cantoneseText, ...rest } = message;
  if (cantoneseText === undefined) return rest;
  return rest.dialectText !== undefined ? rest : { ...rest, dialectText: cantoneseText };
}

export function sessionToRow(session: Session, userId: string): SessionRow {
  return {
    id: session.id,
    user_id: userId,
    title: session.title ?? null,
    date_display: session.date,
    // Domain messages are already dialect-neutral, but normalize defensively
    // so a legacy key can never be written back to the jsonb column.
    messages: session.messages.map(normalizeMessage),
    persona: session.persona ?? null,
    tags: session.tags ?? null,
    created_at: session.createdAt ?? null,
    language_code: session.languageCode ?? null,
  };
}

export function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    date: row.date_display,
    messages: row.messages.map(normalizeMessage),
    ...(row.title !== null ? { title: row.title } : {}),
    ...(row.created_at !== null ? { createdAt: row.created_at } : {}),
    ...(row.persona !== null ? { persona: row.persona } : {}),
    ...(row.tags !== null ? { tags: row.tags } : {}),
    ...(row.language_code !== null ? { languageCode: row.language_code } : {}),
  };
}

// In cloud mode the domain UserProfile.id IS the auth user id (profiles has
// user_id as its primary key — no separate id column).
export function profileToRow(profile: UserProfile, userId: string): ProfileRow {
  return {
    user_id: userId,
    name: profile.name,
    preferred_dialect: profile.preferredDialect,
    preferred_tone: profile.preferredTone,
    tone_override_enabled: profile.toneOverrideEnabled,
    personality_notes: profile.personalityNotes,
    conversation_count: profile.conversationCount,
    persona_summary: profile.personaSummary ?? null,
    characteristic_phrases: profile.characteristicPhrases ?? null,
    active_persona: profile.activePersona ?? null,
    persona_profiles: profile.personaProfiles ?? null,
    preferred_voice_id: profile.preferredVoiceId ?? null,
    custom_voice_id: profile.customVoiceId ?? null,
    suggested_replies_enabled: profile.suggestedRepliesEnabled ?? null,
    tour_completed: profile.tourCompleted ?? null,
    data_collection_consent: profile.dataCollectionConsent ?? false,
    audio_retention_consent: profile.audioRetentionConsent ?? false,
    consent_updated_at: profile.consentUpdatedAt ?? null,
    created_at: profile.createdAt,
    updated_at: profile.updatedAt,
  };
}

export function rowToProfile(row: ProfileRow): UserProfile {
  return {
    id: row.user_id,
    name: row.name,
    preferredDialect: row.preferred_dialect,
    preferredTone: row.preferred_tone,
    toneOverrideEnabled: row.tone_override_enabled,
    personalityNotes: row.personality_notes,
    conversationCount: row.conversation_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.persona_summary !== null ? { personaSummary: row.persona_summary } : {}),
    ...(row.characteristic_phrases !== null ? { characteristicPhrases: row.characteristic_phrases } : {}),
    ...(row.active_persona !== null ? { activePersona: row.active_persona } : {}),
    ...(row.persona_profiles !== null ? { personaProfiles: row.persona_profiles } : {}),
    ...(row.preferred_voice_id !== null ? { preferredVoiceId: row.preferred_voice_id } : {}),
    ...(row.custom_voice_id !== null ? { customVoiceId: row.custom_voice_id } : {}),
    ...(row.suggested_replies_enabled !== null
      ? { suggestedRepliesEnabled: row.suggested_replies_enabled }
      : {}),
    ...(row.tour_completed !== null ? { tourCompleted: row.tour_completed } : {}),
    ...(row.data_collection_consent ? { dataCollectionConsent: true } : {}),
    ...(row.audio_retention_consent ? { audioRetentionConsent: true } : {}),
    ...(row.consent_updated_at !== null ? { consentUpdatedAt: row.consent_updated_at } : {}),
  };
}

export function tagToRow(tag: Tag, userId: string): TagRow {
  return {
    id: tag.id,
    user_id: userId,
    name: tag.name,
    type: tag.type,
    created_at: tag.createdAt,
  };
}

export function rowToTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    createdAt: row.created_at,
  };
}

export function conversationLessonToRow(lesson: ConversationLesson, userId: string): ConversationLessonRow {
  return {
    id: lesson.id,
    user_id: userId,
    session_id: lesson.sessionId,
    title: lesson.title,
    vocabulary: lesson.vocabulary,
    exam_best_score: lesson.examBestScore ?? null,
    exam_completed: lesson.examCompleted,
    exam_attempts: lesson.examAttempts,
    persona: lesson.persona ?? null,
    current_phase: lesson.currentPhase ?? null,
    created_at: lesson.createdAt,
    language_code: lesson.languageCode ?? null,
  };
}

export function rowToConversationLesson(row: ConversationLessonRow): ConversationLesson {
  return {
    id: row.id,
    sessionId: row.session_id,
    title: row.title,
    createdAt: row.created_at,
    vocabulary: row.vocabulary,
    examCompleted: row.exam_completed,
    examAttempts: row.exam_attempts,
    ...(row.exam_best_score !== null ? { examBestScore: row.exam_best_score } : {}),
    ...(row.persona !== null ? { persona: row.persona } : {}),
    ...(row.current_phase !== null ? { currentPhase: row.current_phase } : {}),
    ...(row.language_code !== null ? { languageCode: row.language_code } : {}),
  };
}

export function lessonProgressToRow(progress: LessonProgress, userId: string): LessonProgressRow {
  return {
    user_id: userId,
    lesson_id: progress.lessonId,
    completed_levels: progress.completedLevels,
    total_levels: progress.totalLevels,
    last_accessed_at: progress.lastAccessedAt,
    last_accuracy: progress.lastAccuracy ?? null,
  };
}

export function rowToLessonProgress(row: LessonProgressRow): LessonProgress {
  return {
    lessonId: row.lesson_id,
    completedLevels: row.completed_levels,
    totalLevels: row.total_levels,
    lastAccessedAt: row.last_accessed_at,
    ...(row.last_accuracy !== null ? { lastAccuracy: row.last_accuracy } : {}),
  };
}

export function reviewStateToRow(state: PhraseReviewState, userId: string): ReviewStateRow {
  return {
    user_id: userId,
    phrase_id: state.phraseId,
    due: state.due,
    interval_days: state.intervalDays,
    ease: state.ease,
    reps: state.reps,
    lapses: state.lapses,
    updated_at: state.updatedAt,
  };
}

export function rowToReviewState(row: ReviewStateRow): PhraseReviewState {
  return {
    phraseId: row.phrase_id,
    due: row.due,
    intervalDays: row.interval_days,
    ease: row.ease,
    reps: row.reps,
    lapses: row.lapses,
    updatedAt: row.updated_at,
  };
}
