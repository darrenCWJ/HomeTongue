import type { PhraseReviewState } from "../../types";
import type { IReviewStateRepository } from "../interfaces";
import { assertNoError, requireAuth } from "./CloudRepositories";
import { reviewStateToRow, rowToReviewState, type ReviewStateRow } from "./mapping";

/**
 * Supabase-backed spaced-repetition schedule store (table `review_states`,
 * composite PK (user_id, phrase_id) — see
 * supabase/migrations/0003_srs_and_lesson_accuracy.sql).
 *
 * Per-entity upserts only, mirroring CloudPhraseRepository: no list-based
 * prune deletes, so a stale device can never wipe another device's schedules.
 */
export class CloudReviewStateRepository implements IReviewStateRepository {
  async getAll(): Promise<PhraseReviewState[]> {
    const { supabase, userId } = await requireAuth();
    const { data, error } = await supabase.from("review_states").select("*").eq("user_id", userId);
    assertNoError(error, "load review schedules");
    return ((data ?? []) as ReviewStateRow[]).map(rowToReviewState);
  }

  async put(state: PhraseReviewState): Promise<void> {
    const { supabase, userId } = await requireAuth();
    const { error } = await supabase
      .from("review_states")
      .upsert(reviewStateToRow(state, userId), { onConflict: "user_id,phrase_id" });
    assertNoError(error, "save review schedule");
  }

  async putMany(states: PhraseReviewState[]): Promise<void> {
    if (states.length === 0) return;
    const { supabase, userId } = await requireAuth();
    const rows = states.map((state) => reviewStateToRow(state, userId));
    const { error } = await supabase.from("review_states").upsert(rows, { onConflict: "user_id,phrase_id" });
    assertNoError(error, "save review schedules");
  }

  async delete(phraseId: string): Promise<void> {
    const { supabase, userId } = await requireAuth();
    const { error } = await supabase
      .from("review_states")
      .delete()
      .eq("user_id", userId)
      .eq("phrase_id", phraseId);
    assertNoError(error, "delete review schedule");
  }
}
