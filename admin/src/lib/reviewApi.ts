import { getSupabase } from "./supabase";
import type {
  LanguageCount,
  ReviewedEntry,
  ReviewVerdict,
  SampleReview,
  SpeechSample,
  StatsSummary,
} from "../types";

const SAMPLE_COLUMNS =
  "id, user_id, language, source, expected_text, transcript, corrected_text, score, stt_model, audio_url, device, created_at";
const REVIEW_COLUMNS = "sample_id, reviewer_id, verdict, corrected_text, notes, created_at";

/** Rows fetched per round-trip while filling a queue page. */
const FETCH_CHUNK = 50;
/** Signed playback URLs stay valid for 5 minutes. */
const SIGNED_URL_TTL_SECONDS = 300;
/** PostgREST caps a single select at 1000 rows; page the language scan. */
const LANGUAGE_SCAN_CHUNK = 1000;
const LANGUAGE_SCAN_MAX_ROWS = 20000;

const ALL_VERDICTS: readonly ReviewVerdict[] = ["verified", "corrected", "rejected"];

/** IDs of every sample that already has a review (one review per sample). */
export async function fetchReviewedSampleIds(): Promise<Set<string>> {
  const { data, error } = await getSupabase().from("sample_reviews").select("sample_id");
  if (error) throw new Error(`Failed to load existing reviews: ${error.message}`);
  const rows = (data ?? []) as { sample_id: string }[];
  return new Set(rows.map((row) => row.sample_id));
}

export interface QueuePage {
  samples: SpeechSample[];
  /** Offset into speech_samples (newest first) to resume from next time. */
  nextOffset: number;
  hasMore: boolean;
}

/**
 * Page of unreviewed samples, newest first. Fetches speech_samples in chunks
 * and filters out already-reviewed IDs client-side until `wanted` samples are
 * collected or the table is exhausted.
 */
export async function fetchUnreviewedPage(
  reviewedIds: ReadonlySet<string>,
  offset: number,
  wanted: number
): Promise<QueuePage> {
  const supabase = getSupabase();
  const collected: SpeechSample[] = [];
  let cursor = offset;
  let hasMore = true;

  while (collected.length < wanted && hasMore) {
    const { data, error } = await supabase
      .from("speech_samples")
      .select(SAMPLE_COLUMNS)
      .order("created_at", { ascending: false })
      .range(cursor, cursor + FETCH_CHUNK - 1);
    if (error) throw new Error(`Failed to load samples: ${error.message}`);

    const rows = (data ?? []) as unknown as SpeechSample[];
    cursor += rows.length;
    hasMore = rows.length === FETCH_CHUNK;
    for (const row of rows) {
      if (!reviewedIds.has(row.id)) collected.push(row);
    }
  }

  return { samples: collected, nextOffset: cursor, hasMore };
}

export interface SubmitReviewInput {
  sampleId: string;
  reviewerId: string;
  verdict: ReviewVerdict;
  correctedText: string | null;
  notes: string | null;
}

/** Upsert the (single) review for a sample. */
export async function submitReview(input: SubmitReviewInput): Promise<void> {
  const { error } = await getSupabase()
    .from("sample_reviews")
    .upsert(
      {
        sample_id: input.sampleId,
        reviewer_id: input.reviewerId,
        verdict: input.verdict,
        corrected_text: input.correctedText,
        notes: input.notes,
      },
      { onConflict: "sample_id" }
    );
  if (error) throw new Error(`Failed to save review: ${error.message}`);
}

/**
 * Recent reviews joined with their samples (two queries — no FK embed needed),
 * newest review first.
 */
export async function fetchReviewedEntries(limit: number): Promise<ReviewedEntry[]> {
  const supabase = getSupabase();

  const { data: reviewData, error: reviewError } = await supabase
    .from("sample_reviews")
    .select(REVIEW_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (reviewError) throw new Error(`Failed to load reviews: ${reviewError.message}`);

  const reviews = (reviewData ?? []) as unknown as SampleReview[];
  if (reviews.length === 0) return [];

  const ids = reviews.map((review) => review.sample_id);
  const { data: sampleData, error: sampleError } = await supabase
    .from("speech_samples")
    .select(SAMPLE_COLUMNS)
    .in("id", ids);
  if (sampleError) throw new Error(`Failed to load reviewed samples: ${sampleError.message}`);

  const samples = (sampleData ?? []) as unknown as SpeechSample[];
  const byId = new Map(samples.map((sample) => [sample.id, sample]));
  return reviews.map((review) => ({ review, sample: byId.get(review.sample_id) ?? null }));
}

/**
 * Resolve a sample's audio to a playable URL. `audio_url` holds a storage
 * object path inside the private "recordings" bucket (see
 * speechSampleService.buildRecordingPath in the main app), so playback goes
 * through a short-lived signed URL. Absolute URLs pass through untouched.
 */
export async function createRecordingUrl(pathOrUrl: string): Promise<string> {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const { data, error } = await getSupabase()
    .storage.from("recordings")
    .createSignedUrl(pathOrUrl, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    throw new Error(`Failed to sign audio URL: ${error?.message ?? "no URL returned"}`);
  }
  return data.signedUrl;
}

async function countRows(table: string, verdict?: ReviewVerdict): Promise<number> {
  let query = getSupabase().from(table).select("*", { count: "exact", head: true });
  if (verdict) query = query.eq("verdict", verdict);
  const { count, error } = await query;
  if (error) throw new Error(`Failed to count ${table}: ${error.message}`);
  return count ?? 0;
}

/** Per-language sample counts, aggregated client-side (bounded scan). */
async function fetchLanguageCounts(): Promise<LanguageCount[]> {
  const supabase = getSupabase();
  const counts = new Map<string, number>();

  for (let offset = 0; offset < LANGUAGE_SCAN_MAX_ROWS; offset += LANGUAGE_SCAN_CHUNK) {
    const { data, error } = await supabase
      .from("speech_samples")
      .select("language")
      .range(offset, offset + LANGUAGE_SCAN_CHUNK - 1);
    if (error) throw new Error(`Failed to load language breakdown: ${error.message}`);

    const rows = (data ?? []) as { language: string | null }[];
    for (const row of rows) {
      const key = row.language && row.language.length > 0 ? row.language : "unknown";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (rows.length < LANGUAGE_SCAN_CHUNK) break;
  }

  return [...counts.entries()]
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count);
}

export async function fetchStats(): Promise<StatsSummary> {
  const [totalSamples, correctionsCount, languageCounts, ...verdictTotals] = await Promise.all([
    countRows("speech_samples"),
    countRows("corrections"),
    fetchLanguageCounts(),
    ...ALL_VERDICTS.map((verdict) => countRows("sample_reviews", verdict)),
  ]);

  const verdictCounts: Record<ReviewVerdict, number> = {
    verified: verdictTotals[0] ?? 0,
    corrected: verdictTotals[1] ?? 0,
    rejected: verdictTotals[2] ?? 0,
  };

  return {
    totalSamples,
    totalReviews: verdictCounts.verified + verdictCounts.corrected + verdictCounts.rejected,
    verdictCounts,
    correctionsCount,
    languageCounts,
  };
}
