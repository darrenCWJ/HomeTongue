// Shared domain types for the admin app. Column names mirror the Postgres
// schema in supabase/migrations/0002_ml_data_pipeline.sql (speech_samples,
// corrections), 0005_admin_review.sql (sample_reviews), the
// admin_dashboard_stats() RPC payload from 0007, and
// 0008_lesson_content.sql (lesson_content).

export interface SpeechSample {
  id: string;
  user_id: string;
  language: string;
  source: "exam" | "chat";
  /** Exam mode: the phrase the learner was asked to say. Null for chat samples. */
  expected_text: string | null;
  /** What the STT model returned. */
  transcript: string;
  /** The learner's own manual correction, when they edited the transcript. */
  corrected_text: string | null;
  /** Pronunciation score 0–100, when scored. */
  score: number | null;
  stt_model: string | null;
  /** Storage object path in the private "recordings" bucket; null when no audio was retained. */
  audio_url: string | null;
  device: string | null;
  created_at: string;
}

export type ReviewVerdict = "verified" | "corrected" | "rejected";

export interface SampleReview {
  sample_id: string;
  reviewer_id: string;
  verdict: ReviewVerdict;
  /** Admin-corrected transcript; only set for "corrected" verdicts. */
  corrected_text: string | null;
  notes: string | null;
  created_at: string;
}

/** A review joined with its sample (sample may be null if it was deleted). */
export interface ReviewedEntry {
  review: SampleReview;
  sample: SpeechSample | null;
}

export interface LanguageCount {
  language: string;
  count: number;
}

export interface StatsSummary {
  totalSamples: number;
  totalReviews: number;
  verdictCounts: Record<ReviewVerdict, number>;
  correctionsCount: number;
  languageCounts: LanguageCount[];
}

// ---------- Product analytics dashboard ----------
// Shape of the jsonb payload returned by the admin_dashboard_stats(days_window)
// RPC (supabase/migrations/0007). All sections are always present; arrays may
// be empty. The function raises "admin only" for non-admin sessions.

export interface DialectUserCount {
  dialect: string;
  users: number;
}

export interface DashboardOverview {
  total_users: number;
  new_users_7d: number;
  new_users_30d: number;
  active_users_7d: number;
  active_users_30d: number;
  data_consent_users: number;
  audio_consent_users: number;
  users_by_dialect: DialectUserCount[];
}

export interface LanguageContentCounts {
  language_code: string;
  phrases: number;
  sessions: number;
  conversation_lessons: number;
  speech_samples: number;
}

export interface DashboardEngagement {
  phrases_total: number;
  phrases_bookmarked: number;
  sessions_total: number;
  lessons_started: number;
  lessons_completed: number;
  srs_active_users: number;
  review_states_total: number;
  exam_attempts: number;
  /** Mean exam score 0–100; null when there are no scored attempts. */
  avg_exam_score: number | null;
}

export interface HardLesson {
  lesson_id: string;
  users: number;
  /** Mean last_accuracy 0–100 across users who attempted the lesson. */
  avg_accuracy: number;
}

export interface SttLanguageQuality {
  language: string;
  samples: number;
  /** Mean pronunciation score 0–100; null when no samples were scored. */
  avg_score: number | null;
}

export interface DashboardImprovement {
  hardest_lessons: HardLesson[];
  stt_by_language: SttLanguageQuality[];
  transcript_edits: number;
  suggestion_ratings_up: number;
  suggestion_ratings_down: number;
}

export interface DailyActivity {
  /** Calendar day, "YYYY-MM-DD". */
  day: string;
  new_users: number;
  sessions: number;
  speech_samples: number;
}

export interface DashboardStats {
  generated_at: string;
  overview: DashboardOverview;
  languages: LanguageContentCounts[];
  engagement: DashboardEngagement;
  improvement: DashboardImprovement;
  daily: DailyActivity[];
}

// ---------- Lesson content publishing ----------
// Shape of lesson_content.content (supabase/migrations/0008): the
// per-language registry shape produced by scripts/lib/lessonCsv.mjs
// rowsToContent — exactly what src/data/lessons/<code>/index.ts exports for
// static content. Field names mirror the main app's src/types.ts
// (VocabularyItem / ConversationTurn / LessonLevel / Lesson /
// LessonCategory) after the dialect-neutral rename: `dialect` is the text in
// the language's own script, `romanization` its reading (Jyutping, Tâi-lô…).

export interface LessonVocabItem {
  english: string;
  /** The word/phrase in the dialect's own script (legacy name: cantonese). */
  dialect: string;
  /** Romanized reading (legacy name: pronunciation). */
  romanization: string;
  exampleSentence?: string;
}

export interface LessonConversationTurn {
  speaker: "user" | "them";
  english: string;
  dialect: string;
  romanization: string;
  hint?: string;
}

export interface LessonLevel {
  level: number;
  title: string;
  description: string;
  exerciseType: string;
  vocabulary: LessonVocabItem[];
  conversation?: LessonConversationTurn[];
}

export interface LessonEntry {
  id: string;
  categoryId: string;
  title: string;
  description: string;
  difficulty: string;
  tags: string[];
  content: {
    vocabulary: LessonVocabItem[];
    levels?: LessonLevel[];
  };
}

export interface LessonCategory {
  id: string;
  title: string;
  description: string;
  icon: string;
}

/** One language's full lesson registry — the lesson_content.content jsonb. */
export interface LessonRegistryContent {
  categories: LessonCategory[];
  lessons: LessonEntry[];
}

/** A public.lesson_content row (0008). */
export interface LessonContentRow {
  language_code: string;
  content: LessonRegistryContent;
  published: boolean;
  updated_by: string;
  updated_at: string;
}
