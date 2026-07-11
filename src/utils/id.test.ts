import { describe, test, expect } from "vitest";
import { newId } from "./id";

describe("newId", () => {
  test("generates non-empty unique ids", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(id.length).toBeGreaterThan(8);
  });
});
