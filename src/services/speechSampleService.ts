import type { UserProfile } from "../types";
import { getSupabaseClient } from "../lib/supabase";
import { getActiveLanguagePack } from "../languages";
import { blobToWav } from "../hooks/audio";
import { newId } from "../utils/id";

// ML data capture (Phase 6, docs/ML_PIPELINE.md) — fire-and-forget.
//
// Config-gated with the same static-gate pattern as src/lib/authGateway.ts:
// the `!!(import.meta.env...)` expression below is constant-folded by Vite's
// define replacement, so in a local-only build the Supabase branch (and the
// @supabase/supabase-js dependency) is dead-code-eliminated from the bundle.
// Keep the expression in sync with src/lib/supabase.ts.
//
// Nothing here ever blocks or breaks UX: both entry points return void
// immediately, do all work asynchronously, and swallow every error with a
// single console.warn. The database RLS insert policies re-check consent
// server-side regardless (supabase/migrations/0002_ml_data_pipeline.sql).
const isCloudCaptureConfigured: boolean = !!(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
);

const STT_MODEL = "gpt-4o-transcribe";
const DEVICE = "web";

export interface ConsentFlags {
  /** dataCollectionConsent: text-level data may be stored. */
  data: boolean;
  /** audioRetentionConsent: recordings may additionally be kept. */
  audio: boolean;
}

/** Derive consent flags for the capture calls from the current profile. */
export function consentFromProfile(profile: UserProfile | null | undefined): ConsentFlags {
  return {
    data: profile?.dataCollectionConsent === true,
    audio: profile?.audioRetentionConsent === true,
  };
}

export interface SpeechSampleInput {
  source: "exam" | "chat";
  /** Exam: the phrase the learner was asked to say. */
  expectedText?: string;
  /** What the STT model returned. */
  transcript: string;
  /** The user's manual correction, when they edited. */
  correctedText?: string;
  /** Pronunciation score, 0–100. */
  score?: number;
  /** Raw recording; uploaded only when `consent.audio` is true. */
  audioBlob?: Blob;
}

export interface CorrectionInput {
  kind: "transcript_edit" | "suggestion_rating";
  original: string;
  corrected?: string;
  rating?: "up" | "down";
  context?: string;
}

export interface SpeechSampleRow {
  user_id: string;
  language: string;
  source: "exam" | "chat";
  expected_text: string | null;
  transcript: string;
  corrected_text: string | null;
  score: number | null;
  stt_model: string;
  audio_url: string | null;
  device: string;
}

export interface CorrectionRow {
  user_id: string;
  language: string;
  kind: "transcript_edit" | "suggestion_rating";
  original: string;
  corrected: string | null;
  rating: "up" | "down" | null;
  context: string | null;
}

/** Pure: build the speech_samples insert payload (unit-testable seam). */
export function buildSpeechSampleRow(
  input: SpeechSampleInput,
  meta: { userId: string; language: string; audioUrl: string | null }
): SpeechSampleRow {
  return {
    user_id: meta.userId,
    language: meta.language,
    source: input.source,
    expected_text: input.expectedText ?? null,
    transcript: input.transcript,
    corrected_text: input.correctedText ?? null,
    score: typeof input.score === "number" ? Math.min(100, Math.max(0, Math.round(input.score))) : null,
    stt_model: STT_MODEL,
    audio_url: meta.audioUrl,
    device: DEVICE,
  };
}

/** Pure: build the corrections insert payload (unit-testable seam). */
export function buildCorrectionRow(
  input: CorrectionInput,
  meta: { userId: string; language: string }
): CorrectionRow {
  return {
    user_id: meta.userId,
    language: meta.language,
    kind: input.kind,
    original: input.original,
    corrected: input.corrected ?? null,
    rating: input.rating ?? null,
    context: input.context ?? null,
  };
}

/** Pure: storage object path inside the private `recordings` bucket. */
export function buildRecordingPath(userId: string, uuid: string): string {
  return `${userId}/${uuid}.wav`;
}

// Data-collection consent is checked by the exported wrappers before the
// gateway is ever invoked; the gateway only needs the audio-retention flag.
interface CaptureGateway {
  recordSpeechSample(input: SpeechSampleInput, isAudioConsented: boolean): Promise<void>;
  recordCorrection(input: CorrectionInput): Promise<void>;
}

function createDisabledCaptureGateway(): CaptureGateway {
  return {
    recordSpeechSample: () => Promise.resolve(),
    recordCorrection: () => Promise.resolve(),
  };
}

function createSupabaseCaptureGateway(): CaptureGateway {
  async function signedInUserId(): Promise<string | null> {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error) return null;
    return data.session?.user?.id ?? null;
  }

  return {
    async recordSpeechSample(input: SpeechSampleInput, isAudioConsented: boolean): Promise<void> {
      const userId = await signedInUserId();
      if (!userId) return;
      const supabase = getSupabaseClient();

      let audioUrl: string | null = null;
      if (isAudioConsented && input.audioBlob) {
        const path = buildRecordingPath(userId, newId());
        const wavBlob = await blobToWav(input.audioBlob);
        const { error: uploadError } = await supabase.storage
          .from("recordings")
          .upload(path, wavBlob, { contentType: "audio/wav" });
        // A failed upload degrades to a text-only sample rather than dropping it.
        if (!uploadError) audioUrl = path;
      }

      const row = buildSpeechSampleRow(input, {
        userId,
        language: getActiveLanguagePack().code,
        audioUrl,
      });
      const { error } = await supabase.from("speech_samples").insert(row);
      if (error) throw new Error(error.message);
    },

    async recordCorrection(input: CorrectionInput): Promise<void> {
      const userId = await signedInUserId();
      if (!userId) return;
      const row = buildCorrectionRow(input, { userId, language: getActiveLanguagePack().code });
      const { error } = await getSupabaseClient().from("corrections").insert(row);
      if (error) throw new Error(error.message);
    },
  };
}

function createCaptureGateway(): CaptureGateway {
  if (isCloudCaptureConfigured) {
    return createSupabaseCaptureGateway();
  }
  return createDisabledCaptureGateway();
}

const captureGateway: CaptureGateway = createCaptureGateway();

/**
 * Record a labeled speech sample (exam attempt or chat transcription).
 * No-op unless Supabase is configured, the user is signed in, and the profile
 * has data-collection consent. Never throws; never blocks the caller.
 */
export function recordSpeechSample(input: SpeechSampleInput, consent: ConsentFlags): void {
  if (!isCloudCaptureConfigured || !consent.data) return;
  captureGateway
    .recordSpeechSample(input, consent.audio)
    .catch((err) => console.warn("Speech sample capture skipped:", err));
}

/**
 * Record a correction/preference event (transcript edit or suggestion rating).
 * Same gating and fire-and-forget semantics as recordSpeechSample.
 */
export function recordCorrection(input: CorrectionInput, consent: ConsentFlags): void {
  if (!isCloudCaptureConfigured || !consent.data) return;
  captureGateway.recordCorrection(input).catch((err) => console.warn("Correction capture skipped:", err));
}
