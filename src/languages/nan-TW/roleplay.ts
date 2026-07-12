import type { RoleplayLine, RoleplayPack, RoleplayScenario } from "../roleplay";

/**
 * Roleplay rehearsal scenarios for Hokkien (nan-TW pack code, Singapore usage).
 *
 * ⚠ AI-DRAFTED CONTENT — pending SINGAPOREAN native-speaker review. The
 * scenarios target Hokkien as spoken by Hokkien families in Singapore
 * (Amoy-based; pasar malam, kopitiam, wet market). Tâi-lô is kept as the
 * ROMANIZATION SYSTEM only — it is a well-documented, learnable standard that
 * renders Singapore Hokkien fine — see the locale note in ./index.ts for why
 * the pack code stays "nan-TW".
 *
 * The nan-TW pack is text-first (capabilities { tts: false, stt: false }), so
 * these rehearsals are TYPED conversations: the roleplay UI hides the mic and
 * skips autoplay for this pack, and the prompts below describe typed (not
 * speech-recognised) learner replies.
 */

const LANGUAGE_CODE = "nan-TW";

function buildBotSystem(counterpart: string, setting: string, register: string): string {
  return `You are roleplaying as ${counterpart} in a written Singapore Hokkien rehearsal app for heritage learners. Setting: ${setting}. Stay fully in character for the whole conversation.

Rules:
- Write natural conversational SINGAPORE Hokkien (Amoy-based) in Traditional Han characters — authentic Hokkien wording, not Mandarin phrasing. Malay loanwords common in Singapore Hokkien (kopi, pasar, roti, lui, suka) are natural in casual speech; prefer Singapore contexts (kopitiam, hawker centre, pasar malam, MRT) over Taiwan ones. Register: ${register}.
- ONE short spoken line per turn (aim for under 20 characters) — real speech, never paragraphs or lists.
- React naturally to the learner's last reply and keep the conversation moving, usually with a simple question.
- The learner types their replies and may mix in Mandarin or English — stay in character, keep your Hokkien simple, and never switch to English dialogue.
- Never break character, mention AI, or add commentary.
- Earlier lines in the transcript appear as plain text, but your reply must still be ONLY a JSON object (no markdown, no explanation) with this exact structure:
{ "dialect": "<your line in Traditional Han characters>", "romanization": "<Tâi-lô romanization>", "english": "<natural English translation>" }`;
}

function scenario(
  def: Omit<RoleplayScenario, "languageCode" | "botSystem"> & { register: string }
): RoleplayScenario {
  const { register, ...rest } = def;
  return {
    ...rest,
    languageCode: LANGUAGE_CODE,
    botSystem: buildBotSystem(def.counterpart, def.setting, register),
  };
}

const openingLine = (dialect: string, romanization: string, english: string): RoleplayLine => ({
  dialect,
  romanization,
  english,
});

const NAN_TW_ROLEPLAY_SCENARIOS: RoleplayScenario[] = [
  scenario({
    // Historical id (scenario was a Taiwan night market before the Singapore
    // localization) — kept stable on purpose.
    id: "nan-night-market",
    title: "Pasar Malam Food Run",
    subtitle: "Order snacks like a local at the pasar malam",
    emoji: "🍢",
    counterpart: "a warm, fast-talking pasar malam food stall owner (頭家)",
    setting: "a busy Singapore pasar malam (night market) food stall in the evening",
    register: "friendly, energetic street-vendor Hokkien — short hawking lines and quick questions",
    opening: openingLine(
      "來喔，來喔！欲食啥物？阮的沙嗲真好食喔！",
      "lâi--ooh, lâi--ooh! beh tsia̍h siánn-mih? guán ê sa-te tsin hó-tsia̍h--ooh!",
      "Come on over! What would you like to eat? Our satay is really tasty!"
    ),
    goalHints: ["Order a dish (我欲這个)", "Ask how much it costs (偌濟鐳)", "Say it tastes great (真好食)"],
  }),
  scenario({
    id: "nan-family-gathering",
    title: "Greeting the Relatives",
    subtitle: "Say hello to family at a gathering",
    emoji: "🏮",
    counterpart: "the learner's grandmother (阿媽), warm and doting",
    setting: "arriving at a big family gathering at grandma's flat in Singapore",
    register:
      "affectionate elder-to-grandchild family speech, soft particles like 啦/喔/矣, urging them to eat",
    opening: openingLine(
      "你來矣！食飽未？緊入來坐啦！",
      "lí lâi--ah! tsia̍h pá buē? kín ji̍p-lâi tsē--lah!",
      "You're here! Have you eaten? Come in and sit down!"
    ),
    goalHints: [
      "Greet grandma respectfully (阿媽好)",
      "Answer whether you have eaten (食飽矣)",
      "Ask how she has been",
    ],
  }),
  scenario({
    id: "nan-fruit-stall",
    title: "Wet Market Fruit Bargain",
    subtitle: "Buy fruit and haggle at the wet market",
    emoji: "🍍",
    counterpart: "a chatty fruit stall owner (頭家) at the wet market",
    setting: "a lively Singapore wet market fruit stall in the morning",
    register: "lively market-vendor Hokkien — friendly hawking and playful bargaining banter",
    opening: openingLine(
      "來看喔！今仔日的王梨真甜，欲試食一塊無？",
      "lâi khuànn--ooh! kin-á-ji̍t ê ông-lâi tsin tinn, beh tshì-tsia̍h tsi̍t tè bô?",
      "Come take a look! Today's pineapple is really sweet — want to try a piece?"
    ),
    goalHints: ["Ask the price (偌濟鐳)", "Bargain a little (算較俗咧)", "Ask which fruit is freshest"],
  }),
];

const COACH_SYSTEM_PROMPT = `You are a supportive Hokkien conversation coach reviewing ONE turn of a rehearsal roleplay. The learner speaks Singapore Hokkien (Amoy-based). Given the scenario, what the counterpart just said, and the learner's reply, judge how appropriate and accurate the reply is in context.

Scoring guide (0-100):
- 85-100: natural, appropriate Hokkien for the relationship and situation.
- 60-84: understandable and appropriate, with minor wording, register, or grammar issues.
- 35-59: partially appropriate — wrong register (e.g. too abrupt for an elder), or mostly Mandarin/English mixed with some Hokkien.
- 0-34: does not respond to the situation, or entirely English with no attempt at Hokkien.
- Replies are typed and often borrow Mandarin characters: be LENIENT about Mandarin↔Hokkien substitutions (不↔毋, 沒有↔無, 他/她↔伊, 什麼↔啥物, 很↔真/足, 吃↔食, 的↔ê) and missing sentence-final particles (啦/喔/呢/咧/矣).
- Malay loanwords normal in Singapore Hokkien (lui for money, kopi, pasar, roti, suka) are CORRECT vocabulary, not errors.

The tip must be ONE concrete, actionable suggestion (max 20 words), ideally including a short Hokkien phrase they could use next time.

Return ONLY a JSON object (no markdown, no explanation): {"score": 78, "tip": "..."}`;

export const NAN_TW_ROLEPLAY: RoleplayPack = {
  languageCode: LANGUAGE_CODE,
  scenarios: NAN_TW_ROLEPLAY_SCENARIOS,
  coachSystem: COACH_SYSTEM_PROMPT,
  fallbackCoachTip: "Keep going — try a fuller Hokkien sentence next turn.",
};
