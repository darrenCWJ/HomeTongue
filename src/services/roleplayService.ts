/**
 * Roleplay rehearsal service — transport + parsing only.
 *
 * All Cantonese-specific content (scenarios, prompts) lives in
 * src/languages/yue-HK/roleplay.ts; this facade mirrors the
 * suggestionService pattern: postJson → /api/chat, parseModelJson,
 * graceful null fallbacks so the UI never crashes on a bad model reply.
 * The model itself is chosen server-side (OPENAI_MODEL), same as every
 * other /api/chat consumer.
 */

import { postJson } from "../lib/api";
import { parseModelJson, truncateForLog } from "../utils/modelJson";
import {
  ROLEPLAY_SCENARIOS,
  buildBotTurnMessages,
  buildCoachMessages,
  getRoleplayScenario,
} from "../languages/yue-HK/roleplay";
import type { RoleplayHistoryEntry, RoleplayLine, RoleplayScenario } from "../languages/yue-HK/roleplay";

export { ROLEPLAY_SCENARIOS, getRoleplayScenario };
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
  /** Bot: Cantonese line. User: raw reply text (Cantonese or English). */
  text: string;
  jyutping?: string;
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
const FALLBACK_TIP = "Keep going — try a fuller Cantonese sentence next turn.";

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
    const parsed = parseModelJson<Partial<RoleplayLine>>(content);
    if (typeof parsed.cantonese !== "string" || parsed.cantonese.trim().length === 0) {
      return null;
    }
    return {
      cantonese: parsed.cantonese.trim(),
      jyutping: typeof parsed.jyutping === "string" ? parsed.jyutping.trim() : "",
      english: typeof parsed.english === "string" ? parsed.english.trim() : "",
    };
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
  let content: string;
  try {
    ({ content } = await postJson<{ content: string }>("/api/chat", {
      messages: buildCoachMessages(scenario, counterpartLine, userTranscript),
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
    return {
      score: Math.min(100, Math.max(0, Math.round(parsed.score))),
      tip: typeof parsed.tip === "string" && parsed.tip.trim().length > 0 ? parsed.tip.trim() : FALLBACK_TIP,
    };
  } catch (error) {
    console.error(
      `Failed to parse roleplay coach feedback as JSON (content: "${truncateForLog(content)}"):`,
      error
    );
    return null;
  }
}
