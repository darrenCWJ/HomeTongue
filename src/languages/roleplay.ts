/**
 * Roleplay rehearsal contract + per-language scenario registry.
 *
 * Scenario CONTENT (personas, openings, prompt text) is language-specific and
 * lives in `src/languages/<code>/roleplay.ts`; this module owns the shared
 * shapes, the transport-agnostic prompt builders, and the registry that maps
 * a language code to its scenarios. Packs without authored scenarios simply
 * are not registered — `hasRoleplayScenarios()` is how the Learn surface
 * decides whether to show the Roleplay entry card.
 *
 * Deliberately NOT part of the core LanguagePack type: scenario content is an
 * optional add-on, and keeping it out of `src/languages/types.ts` means packs
 * ship without it and the pack facade never imports rehearsal prose.
 *
 * Wire format (all languages): the bot must reply with ONLY a JSON object
 *   { "dialect": "<line in the language's own script>",
 *     "romanization": "<reading, e.g. Jyutping / Tâi-lô>",
 *     "english": "<natural English translation>" }
 * The service layer (src/services/roleplayService.ts) still accepts the
 * legacy yue-HK keys (cantonese/jyutping) defensively when parsing.
 */

export interface RoleplayLine {
  /** The line in the language's own script (e.g. Traditional Chinese / Han). */
  dialect: string;
  /** Romanization of the line (e.g. Jyutping with tone numbers, Tâi-lô). */
  romanization: string;
  /** Natural English translation. */
  english: string;
}

export interface RoleplayScenario {
  id: string;
  /** Language code of the pack this scenario belongs to, e.g. "yue-HK". */
  languageCode: string;
  /** Card title, e.g. "Dinner with Grandma". */
  title: string;
  /** One-line description shown on the picker card. */
  subtitle: string;
  /** Emoji shown on the picker card. */
  emoji: string;
  /** Who the bot plays, e.g. "the learner's grandmother (嫲嫲)". */
  counterpart: string;
  /** Short setting description reused in bot + coach prompts. */
  setting: string;
  /** Full system prompt for the bot's turns. */
  botSystem: string;
  /** The bot's scripted first line. */
  opening: RoleplayLine;
  /** 2-3 things the learner should try to do during the rehearsal. */
  goalHints: string[];
}

export interface RoleplayHistoryEntry {
  speaker: "bot" | "user";
  /** Bot: the dialect line. User: raw reply text (dialect or English). */
  text: string;
}

export interface RoleplayChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Everything one language contributes to the roleplay trainer. */
export interface RoleplayPack {
  languageCode: string;
  scenarios: ReadonlyArray<RoleplayScenario>;
  /** System prompt for the per-turn coach (language-specific leniency rules). */
  coachSystem: string;
  /** Tip shown when the coach model returns a score but no usable tip. */
  fallbackCoachTip: string;
}

const MAX_HISTORY_ENTRIES = 12;

/**
 * Build the /api/chat message list for the bot's next in-character line.
 * Bot lines map to `assistant`, learner replies to `user`. Language-agnostic:
 * everything dialect-specific is already baked into `scenario.botSystem`.
 */
export function buildBotTurnMessages(
  scenario: RoleplayScenario,
  history: RoleplayHistoryEntry[]
): RoleplayChatMessage[] {
  const recent = history.slice(-MAX_HISTORY_ENTRIES);
  return [
    { role: "system", content: scenario.botSystem },
    ...recent.map<RoleplayChatMessage>((entry) => ({
      role: entry.speaker === "bot" ? "assistant" : "user",
      content: entry.text,
    })),
  ];
}

/**
 * Build the /api/chat message list for coaching the learner's latest reply.
 * `counterpartLine` is the bot line the learner was responding to. The
 * language-specific scoring rubric comes from `pack.coachSystem`.
 */
export function buildCoachMessages(
  pack: RoleplayPack,
  scenario: RoleplayScenario,
  counterpartLine: string,
  userReply: string
): RoleplayChatMessage[] {
  const userContent = [
    `Scenario: ${scenario.title} — ${scenario.setting}`,
    `Counterpart: ${scenario.counterpart}`,
    `Learner goals for this rehearsal:\n${scenario.goalHints.map((h) => `- ${h}`).join("\n")}`,
    `The counterpart just said: "${counterpartLine}"`,
    `The learner replied (speech-recognised or typed, may contain errors): "${userReply}"`,
    "Score the reply and give one tip.",
  ].join("\n\n");

  return [
    { role: "system", content: pack.coachSystem },
    { role: "user", content: userContent },
  ];
}
