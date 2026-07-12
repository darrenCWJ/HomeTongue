/**
 * Roleplay rehearsal service — transport + parsing only.
 *
 * All language-specific content (scenarios, prompts, coach rubrics) lives in
 * `src/languages/<code>/roleplay.ts` and is resolved through the registry in
 * src/languages/roleplayRegistry.ts — this facade never inlines dialect
 * specifics. It mirrors the suggestionService pattern: postJson → /api/chat,
 * parseModelJson, graceful null fallbacks so the UI never crashes on a bad
 * model reply. The model itself is chosen server-side (OPENAI_MODEL), same as
 * every other /api/chat consumer.
 */

import { postJson } from "../lib/api";
import { parseModelJson, truncateForLog } from "../utils/modelJson";
import { buildBotTurnMessages, buildCoachMessages } from "../languages/roleplay";
import { getRoleplayPack, getRoleplayScenarios, hasRoleplayScenarios } from "../languages/roleplayRegistry";
import type { RoleplayHistoryEntry, RoleplayLine, RoleplayScenario } from "../languages/roleplay";

export { getRoleplayScenarios, hasRoleplayScenarios };
export type { RoleplayHistoryEntry, RoleplayLine, RoleplayScenario };

export interface RoleplayCoachFeedback {
  /** 0-100 appropriateness/accuracy score for the turn. */
  score: number;
  /** One concrete, actionable suggestion. */
  tip: string;
}

/** One rendered turn of the rehearsal (UI state shape). */
export interface RoleplayTurn {
  id: string;
  speaker: "bot" | "user";
  /** Bot: dialect line. User: raw reply text (dialect or English). */
  text: string;
  romanization?: string;
  english?: string;
  coach?: RoleplayCoachFeedback;
  isCoachPending?: boolean;
}

/** Project UI turns down to the prompt-builder history shape. */
export function toHistory(turns: RoleplayTurn[]): RoleplayHistoryEntry[] {
  return turns.map((t) => ({ speaker: t.speaker, text: t.text }));
}

const BOT_TURN_MAX_TOKENS = 300;
const COACH_MAX_TOKENS = 150;
const GENERIC_FALLBACK_TIP = "Keep going — try a fuller sentence in the dialect next turn.";

/**
 * Bot line as it may arrive over the wire: current packs prompt for
 * dialect/romanization, but a cached or misbehaving model reply may still use
 * the legacy yue-HK keys (cantonese/jyutping) — accepted defensively.
 */
type WireBotLine = Partial<RoleplayLine> & { cantonese?: string; jyutping?: string };

function toRoleplayLine(parsed: WireBotLine): RoleplayLine | null {
  const dialect = typeof parsed.dialect === "string" ? parsed.dialect : parsed.cantonese;
  if (typeof dialect !== "string" || dialect.trim().length === 0) return null;
  const romanization =
    typeof parsed.romanization === "string" ? parsed.romanization : (parsed.jyutping ?? "");
  return {
    dialect: dialect.trim(),
    romanization: typeof romanization === "string" ? romanization.trim() : "",
    english: typeof parsed.english === "string" ? parsed.english.trim() : "",
  };
}

/**
 * Ask the model for the counterpart's next in-character line.
 * Returns null on network/parse failure — the caller decides how to surface it.
 */
export async function nextBotTurn(
  scenario: RoleplayScenario,
  history: RoleplayHistoryEntry[]
): Promise<RoleplayLine | null> {
  let content: string;
  try {
    ({ content } = await postJson<{ content: string }>("/api/chat", {
      messages: buildBotTurnMessages(scenario, history),
      temperature: 0.8,
      max_tokens: BOT_TURN_MAX_TOKENS,
    }));
  } catch (error) {
    console.error("Roleplay bot turn request failed:", error);
    return null;
  }

  try {
    return toRoleplayLine(parseModelJson<WireBotLine>(content));
  } catch (error) {
    console.error(
      `Failed to parse roleplay bot turn as JSON (content: "${truncateForLog(content)}"):`,
      error
    );
    return null;
  }
}

/**
 * Score the learner's latest reply (0-100) with one concrete tip.
 * `counterpartLine` is the bot line the learner was responding to.
 * Returns null on failure so the UI can quietly skip the feedback chip.
 */
export async function coachUserTurn(
  scenario: RoleplayScenario,
  counterpartLine: string,
  userTranscript: string
): Promise<RoleplayCoachFeedback | null> {
  const pack = getRoleplayPack(scenario.languageCode);
  if (!pack) {
    console.error(`No roleplay pack registered for language "${scenario.languageCode}".`);
    return null;
  }

  let content: string;
  try {
    ({ content } = await postJson<{ content: string }>("/api/chat", {
      messages: buildCoachMessages(pack, scenario, counterpartLine, userTranscript),
      temperature: 0.2,
      max_tokens: COACH_MAX_TOKENS,
    }));
  } catch (error) {
    console.error("Roleplay coach request failed:", error);
    return null;
  }

  try {
    const parsed = parseModelJson<{ score?: unknown; tip?: unknown }>(content);
    if (typeof parsed.score !== "number" || Number.isNaN(parsed.score)) {
      return null;
    }
    const fallbackTip = pack.fallbackCoachTip || GENERIC_FALLBACK_TIP;
    return {
      score: Math.min(100, Math.max(0, Math.round(parsed.score))),
      tip: typeof parsed.tip === "string" && parsed.tip.trim().length > 0 ? parsed.tip.trim() : fallbackTip,
    };
  } catch (error) {
    console.error(
      `Failed to parse roleplay coach feedback as JSON (content: "${truncateForLog(content)}"):`,
      error
    );
    return null;
  }
}
