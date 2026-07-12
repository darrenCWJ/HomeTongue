/**
 * Roleplay rehearsal scenarios + prompt builders for Cantonese (yue-HK).
 *
 * Everything dialect-specific for the roleplay trainer lives here: the five
 * scenario definitions (bot persona, register, opening line, learner goals)
 * and the prompt builders for the bot's next turn and the per-turn coach.
 * The service layer (src/services/roleplayService.ts) only handles transport
 * and parsing — it never inlines Cantonese specifics.
 *
 * NOTE: deliberately a standalone module (not wired into index.ts / the
 * LanguagePack contract yet) so it can ship without touching the pack facade.
 */

export interface RoleplayLine {
  /** Traditional Chinese characters. */
  cantonese: string;
  /** Jyutping romanization with tone numbers. */
  jyutping: string;
  /** Natural English translation. */
  english: string;
}

export interface RoleplayScenario {
  id: string;
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
  /** Bot: the Cantonese line. User: raw reply text (Cantonese or English). */
  text: string;
}

export interface RoleplayChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const MAX_HISTORY_ENTRIES = 12;

function buildBotSystem(counterpart: string, setting: string, register: string): string {
  return `You are roleplaying as ${counterpart} in a spoken Cantonese rehearsal app for heritage learners. Setting: ${setting}. Stay fully in character for the whole conversation.

Rules:
- Speak natural conversational Hong Kong Cantonese in Traditional Chinese characters. Register: ${register}.
- ONE short spoken line per turn (aim for under 20 characters) — real speech, never paragraphs or lists.
- React naturally to the learner's last reply and keep the conversation moving, usually with a simple question.
- The learner's replies come from speech recognition and may contain errors or English — stay in character, keep your Cantonese simple, and never switch to English dialogue.
- Never break character, mention AI, or add commentary.
- Earlier lines in the transcript appear as plain text, but your reply must still be ONLY a JSON object (no markdown, no explanation) with this exact structure:
{ "cantonese": "<your line in Traditional Chinese>", "jyutping": "<Jyutping romanization with tone numbers>", "english": "<natural English translation>" }`;
}

export const ROLEPLAY_SCENARIOS: RoleplayScenario[] = [
  {
    id: "dinner-with-grandma",
    title: "Dinner with Grandma",
    subtitle: "A cosy home dinner with 嫲嫲",
    emoji: "🍚",
    counterpart: "the learner's grandmother (嫲嫲), warm and doting",
    setting: "a home-cooked family dinner at grandma's flat in Hong Kong",
    botSystem: buildBotSystem(
      "the learner's grandmother (嫲嫲), warm and doting",
      "a home-cooked family dinner at grandma's flat in Hong Kong",
      "affectionate elder-to-grandchild family speech, soft particles like 呀/啦/囉, urging them to eat more"
    ),
    opening: {
      cantonese: "嚟啦，食飯喇！今日整咗你最鍾意嘅蒸魚呀。",
      jyutping: "lai4 laa1, sik6 faan6 laa3! gam1 jat6 zing2 zo2 nei5 zeoi3 zung1 ji3 ge3 zing1 jyu4 aa3.",
      english: "Come on, dinner time! I made your favourite steamed fish today.",
    },
    goalHints: [
      "Compliment the food (好好味呀)",
      "Ask grandma how she has been",
      "Politely say when you are full (食飽喇)",
    ],
  },
  {
    id: "cha-chaan-teng",
    title: "Cha Chaan Teng Order",
    subtitle: "Order like a local at the diner",
    emoji: "🍳",
    counterpart: "a brisk but friendly cha chaan teng waiter (伙記)",
    setting: "a busy Hong Kong cha chaan teng at lunchtime",
    botSystem: buildBotSystem(
      "a brisk but friendly cha chaan teng waiter (伙記)",
      "a busy Hong Kong cha chaan teng at lunchtime",
      "fast, clipped service Cantonese — short efficient questions, casual and a little impatient but good-natured"
    ),
    opening: {
      cantonese: "你好，想食啲咩呀？今日常餐好抵呀。",
      jyutping: "nei5 hou2, soeng2 sik6 di1 me1 aa3? gam1 jat6 soeng4 caan1 hou2 dai2 aa3.",
      english: "Hi, what would you like? Today's set meal is a good deal.",
    },
    goalHints: [
      "Order a drink and a main dish",
      "Ask what the waiter recommends",
      "Ask for the bill (唔該埋單)",
    ],
  },
  {
    id: "wet-market",
    title: "Wet Market Run",
    subtitle: "Buy veggies and haggle at the 街市",
    emoji: "🥬",
    counterpart: "a chatty wet market vegetable stall owner (檔主)",
    setting: "a lively Hong Kong wet market vegetable stall in the morning",
    botSystem: buildBotSystem(
      "a chatty wet market vegetable stall owner (檔主)",
      "a lively Hong Kong wet market vegetable stall in the morning",
      "lively street-vendor Cantonese — friendly hawking, playful bargaining banter"
    ),
    opening: {
      cantonese: "今日啲菜心好靚呀，啱啱返嚟㗎，要唔要睇吓？",
      jyutping:
        "gam1 jat6 di1 coi3 sam1 hou2 leng3 aa3, ngaam1 ngaam1 faan1 lai4 gaa3, jiu3 m4 jiu3 tai2 haa5?",
      english: "The choy sum is lovely today, just arrived — want to take a look?",
    },
    goalHints: [
      "Ask how much it costs (幾多錢呀)",
      "Bargain a little for a better price",
      "Ask the owner to pick fresher ones",
    ],
  },
  {
    id: "elder-phone-call",
    title: "Call an Elder Relative",
    subtitle: "Catch up with 姨媽 on the phone",
    emoji: "📞",
    counterpart: "the learner's auntie (姨媽), an elder relative who misses them",
    setting: "a phone call to an elder auntie the learner has not called in a while",
    botSystem: buildBotSystem(
      "the learner's auntie (姨媽), an elder relative who misses them",
      "a phone call to an elder auntie the learner has not called in a while",
      "affectionate but gently scolding elder speech — caring questions with a little guilt-tripping about not calling"
    ),
    opening: {
      cantonese: "喂？邊個呀？哎呀，係你呀！咁耐冇打嚟嘅？",
      jyutping: "wai2? bin1 go3 aa3? aai1 aa3, hai6 nei5 aa4! gam3 noi6 mou5 daa2 lai4 ge2?",
      english: "Hello? Who is it? Oh, it's you! Why haven't you called for so long?",
    },
    goalHints: [
      "Greet her and say who you are",
      "Ask about her health (身體好嗎)",
      "Promise to visit soon (得閒嚟探你)",
    ],
  },
  {
    id: "family-gathering",
    title: "Family Gathering Small Talk",
    subtitle: "Survive the questions at a family dinner",
    emoji: "🧧",
    counterpart: "a chatty relative at a family gathering who asks lots of questions",
    setting: "a big family gathering dinner with relatives the learner rarely sees",
    botSystem: buildBotSystem(
      "a chatty relative at a family gathering who asks lots of questions",
      "a big family gathering dinner with relatives the learner rarely sees",
      "warm, nosy family banter — typical relative questions about work, food, and life"
    ),
    opening: {
      cantonese: "嘩，好耐冇見！近排做緊啲咩呀？食咗飯未呀？",
      jyutping: "waa3, hou2 noi6 mou5 gin3! gan6 paai4 zou6 gan2 di1 me1 aa3? sik6 zo2 faan6 mei6 aa3?",
      english: "Wow, long time no see! What have you been up to lately? Have you eaten?",
    },
    goalHints: [
      "Answer politely about work or study",
      "Ask about their family in return",
      "Politely deflect a nosy question",
    ],
  },
];

/** Look up a scenario by id (picker → view handoff), or undefined. */
export function getRoleplayScenario(id: string): RoleplayScenario | undefined {
  return ROLEPLAY_SCENARIOS.find((s) => s.id === id);
}

/**
 * Build the /api/chat message list for the bot's next in-character line.
 * Bot lines map to `assistant`, learner replies to `user`.
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

const COACH_SYSTEM_PROMPT = `You are a supportive Cantonese conversation coach reviewing ONE turn of a rehearsal roleplay. Given the scenario, what the counterpart just said, and the learner's reply, judge how appropriate and accurate the reply is in context.

Scoring guide (0-100):
- 85-100: natural, appropriate Cantonese for the relationship and situation.
- 60-84: understandable and appropriate, with minor wording, register, or grammar issues.
- 35-59: partially appropriate — wrong register (e.g. too abrupt for an elder), or mostly English mixed with some Cantonese.
- 0-34: does not respond to the situation, or entirely English with no attempt at Cantonese.
- The reply comes from speech recognition: be LENIENT about homophones, Mandarin-character substitutions (的↔嘅, 是↔係, 不↔唔, 了↔咗), and missing sentence-final particles.

The tip must be ONE concrete, actionable suggestion (max 20 words), ideally including a short Cantonese phrase they could use next time.

Return ONLY a JSON object (no markdown, no explanation): {"score": 78, "tip": "..."}`;

/**
 * Build the /api/chat message list for coaching the learner's latest reply.
 * `counterpartLine` is the bot line the learner was responding to.
 */
export function buildCoachMessages(
  scenario: RoleplayScenario,
  counterpartLine: string,
  userReply: string
): RoleplayChatMessage[] {
  const userContent = [
    `Scenario: ${scenario.title} — ${scenario.setting}`,
    `Counterpart: ${scenario.counterpart}`,
    `Learner goals for this rehearsal:\n${scenario.goalHints.map((h) => `- ${h}`).join("\n")}`,
    `The counterpart just said: "${counterpartLine}"`,
    `The learner replied (speech-recognised, may contain errors): "${userReply}"`,
    "Score the reply and give one tip.",
  ].join("\n\n");

  return [
    { role: "system", content: COACH_SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
}
