import { describe, test, expect } from "vitest";
import { sortSessionsNewestFirst } from "./LocalRepositories";
import type { Session } from "../../types";

const session = (id: string, date: string, createdAt?: string): Session => ({
  id,
  date,
  createdAt,
  messages: [],
});

describe("sortSessionsNewestFirst", () => {
  test("sorts by ISO createdAt descending", () => {
    const sorted = sortSessionsNewestFirst([
      session("old", "1/1/2026", "2026-01-01T00:00:00.000Z"),
      session("new", "1/3/2026", "2026-01-03T00:00:00.000Z"),
      session("mid", "1/2/2026", "2026-01-02T00:00:00.000Z"),
    ]);
    expect(sorted.map((s) => s.id)).toEqual(["new", "mid", "old"]);
  });

  test("orders correctly across months (the old lexicographic bug)", () => {
    // Lexicographically "12/1/2025" > "4/30/2026" — chronologically it is older.
    const sorted = sortSessionsNewestFirst([
      session("december", "12/1/2025", "2025-12-01T00:00:00.000Z"),
      session("april", "4/30/2026", "2026-04-30T00:00:00.000Z"),
    ]);
    expect(sorted.map((s) => s.id)).toEqual(["april", "december"]);
  });

  test("falls back to parsing the display date for legacy records", () => {
    const sorted = sortSessionsNewestFirst([
      session("legacy-old", "1/1/2025"),
      session("with-iso", "1/1/2026", "2026-01-01T00:00:00.000Z"),
    ]);
    expect(sorted.map((s) => s.id)).toEqual(["with-iso", "legacy-old"]);
  });

  test("treats unparseable dates as oldest instead of crashing", () => {
    const sorted = sortSessionsNewestFirst([
      session("garbage", "not a date"),
      session("valid", "1/1/2026", "2026-01-01T00:00:00.000Z"),
    ]);
    expect(sorted.map((s) => s.id)).toEqual(["valid", "garbage"]);
  });

  test("does not mutate the input array", () => {
    const input = [
      session("a", "1/1/2026", "2026-01-01T00:00:00.000Z"),
      session("b", "1/2/2026", "2026-01-02T00:00:00.000Z"),
    ];
    sortSessionsNewestFirst(input);
    expect(input.map((s) => s.id)).toEqual(["a", "b"]);
  });
});
