import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Phrase } from "../../types";
import { CloudPhraseRepository } from "./CloudRepositories";
import { phraseToRow } from "./mapping";

// The invariant under test: the per-entity phrase writes are upsert-only.
// They must NEVER issue a delete (the old replace-all saveAll pruned every
// cloud row missing from the local list — a cross-device data-loss engine).

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

function makePhrase(id: string, overrides: Partial<Phrase> = {}): Phrase {
  return {
    id,
    original: "Thank you",
    dialect: "唔該",
    pronunciation: "m4 goi1",
    isBookmarked: false,
    context: "",
    ...overrides,
  };
}

beforeEach(() => {
  mocks.from.mockClear();
  mocks.del.mockClear();
  mocks.upsert.mockReset();
  mocks.upsert.mockResolvedValue({ error: null });
});

describe("CloudPhraseRepository.put", () => {
  test("upserts the single mapped row keyed on (user_id, id) and never deletes", async () => {
    // Arrange
    const repo = new CloudPhraseRepository();
    const phrase = makePhrase("aaaa1111-0000-0000-0000-000000000001", { isBookmarked: true });

    // Act
    await repo.put(phrase);

    // Assert
    expect(mocks.from).toHaveBeenCalledWith("phrases");
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledWith(phraseToRow(phrase, USER_ID), { onConflict: "user_id,id" });
    expect(mocks.del).not.toHaveBeenCalled();
  });

  test("throws a descriptive error when the upsert fails", async () => {
    // Arrange
    const repo = new CloudPhraseRepository();
    mocks.upsert.mockResolvedValue({ error: { message: "row too large" } });

    // Act + Assert
    await expect(repo.put(makePhrase("aaaa1111-0000-0000-0000-000000000002"))).rejects.toThrow(
      /save phrase.*row too large/
    );
    expect(mocks.del).not.toHaveBeenCalled();
  });
});

describe("CloudPhraseRepository.putMany", () => {
  test("upserts all mapped rows in one call and never deletes", async () => {
    // Arrange
    const repo = new CloudPhraseRepository();
    const phrases = [
      makePhrase("aaaa1111-0000-0000-0000-000000000003"),
      makePhrase("aaaa1111-0000-0000-0000-000000000004", { tags: ["p-food"] }),
    ];

    // Act
    await repo.putMany(phrases);

    // Assert
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledWith(
      phrases.map((p) => phraseToRow(p, USER_ID)),
      { onConflict: "user_id,id" }
    );
    expect(mocks.del).not.toHaveBeenCalled();
  });

  test("performs no network call at all for an empty list", async () => {
    // Arrange
    const repo = new CloudPhraseRepository();

    // Act
    await repo.putMany([]);

    // Assert — an empty upsert list must not turn into any request
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.del).not.toHaveBeenCalled();
  });
});
