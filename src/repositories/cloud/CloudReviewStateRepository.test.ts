import { beforeEach, describe, expect, test, vi } from "vitest";
import type { PhraseReviewState } from "../../types";
import { CloudReviewStateRepository } from "./CloudReviewStateRepository";
import { reviewStateToRow } from "./mapping";

// The invariant under test: putMany is upsert-only on the composite
// (user_id, phrase_id) key and never issues a delete or an empty-list
// network call — mirroring CloudPhraseRepository.putMany.

const USER_ID = "11111111-2222-3333-4444-555555555555";

const mocks = vi.hoisted(() => {
  const upsert = vi.fn();
  const del = vi.fn();
  const from = vi.fn(() => ({ upsert, delete: del }));
  return { upsert, del, from };
});

vi.mock("../../lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "11111111-2222-3333-4444-555555555555" } } },
        error: null,
      }),
    },
    from: mocks.from,
  }),
}));

function makeReviewState(phraseId: string, overrides: Partial<PhraseReviewState> = {}): PhraseReviewState {
  return {
    phraseId,
    due: "2026-07-13T00:00:00.000Z",
    intervalDays: 1,
    ease: 2.5,
    reps: 1,
    lapses: 0,
    updatedAt: "2026-07-12T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mocks.from.mockClear();
  mocks.del.mockClear();
  mocks.upsert.mockReset();
  mocks.upsert.mockResolvedValue({ error: null });
});

describe("CloudReviewStateRepository.putMany", () => {
  test("upserts all mapped rows in one call keyed on (user_id, phrase_id) and never deletes", async () => {
    // Arrange
    const repo = new CloudReviewStateRepository();
    const states = [
      makeReviewState("aaaa1111-0000-0000-0000-000000000001"),
      makeReviewState("aaaa1111-0000-0000-0000-000000000002", { intervalDays: 6, reps: 3, lapses: 1 }),
    ];

    // Act
    await repo.putMany(states);

    // Assert
    expect(mocks.from).toHaveBeenCalledWith("review_states");
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledWith(
      states.map((s) => reviewStateToRow(s, USER_ID)),
      { onConflict: "user_id,phrase_id" }
    );
    expect(mocks.del).not.toHaveBeenCalled();
  });

  test("performs no network call at all for an empty list", async () => {
    // Arrange
    const repo = new CloudReviewStateRepository();

    // Act
    await repo.putMany([]);

    // Assert — an empty upsert list must not turn into any request
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.del).not.toHaveBeenCalled();
  });

  test("throws a descriptive error when the upsert fails", async () => {
    // Arrange
    const repo = new CloudReviewStateRepository();
    mocks.upsert.mockResolvedValue({ error: { message: "row too large" } });

    // Act + Assert
    await expect(repo.putMany([makeReviewState("aaaa1111-0000-0000-0000-000000000003")])).rejects.toThrow(
      /save review schedules.*row too large/
    );
    expect(mocks.del).not.toHaveBeenCalled();
  });
});
