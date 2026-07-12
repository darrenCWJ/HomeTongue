// Shared domain types for the admin app. Column names mirror the Postgres
// schema in supabase/migrations/0002_ml_data_pipeline.sql (speech_samples,
// corrections) and 0005_admin_review.sql (sample_reviews).

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
