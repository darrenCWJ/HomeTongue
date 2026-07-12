import { describe, test, expect } from "vitest";
import { buildBotTurnMessages, buildCoachMessages } from "./roleplay";
import type { RoleplayHistoryEntry } from "./roleplay";
import { getRoleplayPack, getRoleplayScenarios, hasRoleplayScenarios } from "./roleplayRegistry";
import { LANGUAGE_PACKS } from "./index";

const REGISTERED_CODES = ["yue-HK", "nan-TW"] as const;

describe("roleplay registry invariants", () => {
  for (const code of REGISTERED_CODES) {
    const pack = getRoleplayPack(code);

    test(`${code}: pack is registered with at least one scenario`, () => {
      expect(pack).toBeDefined();
      expect(pack!.scenarios.length).toBeGreaterThan(0);
      expect(hasRoleplayScenarios(code)).toBe(true);
    });

    test(`${code}: registry key matches a shipped language pack`, () => {
      expect(Object.keys(LANGUAGE_PACKS)).toContain(code);
    });

    test(`${code}: scenario ids are unique and stamped with the pack's language`, () => {
      const ids = pack!.scenarios.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const scenario of pack!.scenarios) {
        expect(scenario.languageCode).toBe(code);
      }
    });

    test(`${code}: every scenario has a complete opening line and goal hints`, () => {
      for (const scenario of pack!.scenarios) {
        expect(scenario.opening.dialect.length).toBeGreaterThan(0);
        expect(scenario.opening.romanization.length).toBeGreaterThan(0);
        expect(scenario.opening.english.length).toBeGreaterThan(0);
        expect(scenario.goalHints.length).toBeGreaterThanOrEqual(2);
      }
    });

    test(`${code}: bot prompts demand the shared dialect/romanization wire format`, () => {
      for (const scenario of pack!.scenarios) {
        expect(scenario.botSystem).toContain('"dialect"');
        expect(scenario.botSystem).toContain('"romanization"');
        expect(scenario.botSystem).toContain('"english"');
      }
    });

    test(`${code}: coach prompt demands the score/tip JSON format`, () => {
      expect(pack!.coachSystem).toContain('{"score"');
      expect(pack!.fallbackCoachTip.length).toBeGreaterThan(0);
    });
  }

  test("unregistered languages have no scenarios and fail the gate", () => {
    expect(getRoleplayPack("xx-XX")).toBeUndefined();
    expect(hasRoleplayScenarios("xx-XX")).toBe(false);
    expect(getRoleplayScenarios("xx-XX")).toEqual([]);
  });
});

describe("shared prompt builders", () => {
  const pack = getRoleplayPack("nan-TW")!;
  const scenario = pack.scenarios[0];

  test("buildBotTurnMessages maps speakers and leads with the scenario system prompt", () => {
    const history: RoleplayHistoryEntry[] = [
      { speaker: "bot", text: "食飽未？" },
      { speaker: "user", text: "I ate already" },
    ];
    const messages = buildBotTurnMessages(scenario, history);
    expect(messages[0]).toEqual({ role: "system", content: scenario.botSystem });
    expect(messages[1]).toEqual({ role: "assistant", content: "食飽未？" });
    expect(messages[2]).toEqual({ role: "user", content: "I ate already" });
  });

  test("buildBotTurnMessages keeps only the most recent history entries", () => {
    const history: RoleplayHistoryEntry[] = Array.from({ length: 20 }, (_, i) => ({
      speaker: i % 2 === 0 ? ("bot" as const) : ("user" as const),
      text: `turn ${i}`,
    }));
    const messages = buildBotTurnMessages(scenario, history);
    // 1 system message + the 12 most recent history entries.
    expect(messages).toHaveLength(13);
    expect(messages[1].content).toBe("turn 8");
    expect(messages[12].content).toBe("turn 19");
  });

  test("buildCoachMessages embeds the counterpart line and the learner reply", () => {
    const messages = buildCoachMessages(pack, scenario, "欲食啥物？", "我欲一份蚵仔煎");
    expect(messages[0]).toEqual({ role: "system", content: pack.coachSystem });
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("欲食啥物？");
    expect(messages[1].content).toContain("我欲一份蚵仔煎");
    expect(messages[1].content).toContain(scenario.title);
  });
});
