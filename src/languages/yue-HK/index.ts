import type { GoogleTTSVoice, LanguagePack } from "../types";

const VOICES = {
  // Female
  zephyr:        { name: "yue-HK-Chirp3-HD-Zephyr",        gender: "female", style: "Bright" },
  kore:          { name: "yue-HK-Chirp3-HD-Kore",          gender: "female", style: "Firm" },
  aoede:         { name: "yue-HK-Chirp3-HD-Aoede",         gender: "female", style: "Breezy" },
  leda:          { name: "yue-HK-Chirp3-HD-Leda",          gender: "female", style: "Youthful" },
  despina:       { name: "yue-HK-Chirp3-HD-Despina",       gender: "female", style: "Smooth" },
  erinome:       { name: "yue-HK-Chirp3-HD-Erinome",       gender: "female", style: "Clear" },
  gacrux:        { name: "yue-HK-Chirp3-HD-Gacrux",        gender: "female", style: "Mature" },
  laomedeia:     { name: "yue-HK-Chirp3-HD-Laomedeia",     gender: "female", style: "Upbeat" },
  pulcherrima:   { name: "yue-HK-Chirp3-HD-Pulcherrima",   gender: "female", style: "Forward" },
  sulafat:       { name: "yue-HK-Chirp3-HD-Sulafat",       gender: "female", style: "Warm" },
  vindemiatrix:  { name: "yue-HK-Chirp3-HD-Vindemiatrix",  gender: "female", style: "Gentle" },
  callirrhoe:    { name: "yue-HK-Chirp3-HD-Callirrhoe",    gender: "female", style: "Easy-going" },
  autonoe:       { name: "yue-HK-Chirp3-HD-Autonoe",       gender: "female", style: "Bright" },
  achernar:      { name: "yue-HK-Chirp3-HD-Achernar",      gender: "female", style: "Soft" },
  // Male
  puck:          { name: "yue-HK-Chirp3-HD-Puck",          gender: "male",   style: "Upbeat" },
  charon:        { name: "yue-HK-Chirp3-HD-Charon",        gender: "male",   style: "Informative" },
  fenrir:        { name: "yue-HK-Chirp3-HD-Fenrir",        gender: "male",   style: "Excitable" },
  orus:          { name: "yue-HK-Chirp3-HD-Orus",          gender: "male",   style: "Firm" },
  enceladus:     { name: "yue-HK-Chirp3-HD-Enceladus",     gender: "male",   style: "Breathy" },
  iapetus:       { name: "yue-HK-Chirp3-HD-Iapetus",       gender: "male",   style: "Clear" },
  algenib:       { name: "yue-HK-Chirp3-HD-Algenib",       gender: "male",   style: "Gravelly" },
  algieba:       { name: "yue-HK-Chirp3-HD-Algieba",       gender: "male",   style: "Smooth" },
  alnilam:       { name: "yue-HK-Chirp3-HD-Alnilam",       gender: "male",   style: "Firm" },
  rasalgethi:    { name: "yue-HK-Chirp3-HD-Rasalgethi",    gender: "male",   style: "Informative" },
  sadachbia:     { name: "yue-HK-Chirp3-HD-Sadachbia",     gender: "male",   style: "Lively" },
  sadaltager:    { name: "yue-HK-Chirp3-HD-Sadaltager",    gender: "male",   style: "Knowledgeable" },
  schedar:       { name: "yue-HK-Chirp3-HD-Schedar",       gender: "male",   style: "Even" },
  umbriel:       { name: "yue-HK-Chirp3-HD-Umbriel",       gender: "male",   style: "Easy-going" },
  zubenelgenubi: { name: "yue-HK-Chirp3-HD-Zubenelgenubi", gender: "male",   style: "Casual" },
  achird:        { name: "yue-HK-Chirp3-HD-Achird",        gender: "male",   style: "Friendly" },
} as const satisfies Record<string, GoogleTTSVoice>;

const LEGACY_VOICE_MAP = {
  "21m00Tcm4TlvDq8ikWAM": "zephyr",
} as const satisfies Record<string, keyof typeof VOICES>;

const TRANSLATE_SYSTEM_PROMPT = `You are a dialect translation assistant. When given an English phrase, return ONLY a JSON object (no markdown, no explanation) with this exact structure:
{
  "formal": { "text": "<Traditional Chinese>", "pronunciation": "<Jyutping>" },
  "casual": { "text": "<Traditional Chinese>", "pronunciation": "<Jyutping>" },
  "slang": { "text": "<Traditional Chinese>", "pronunciation": "<Jyutping>" },
  "predictedResponse": "<A likely reply a native speaker would give, in Traditional Chinese>",
  "context": "<3-5 word usage context in English>"
}
Use Traditional Chinese characters (not Mandarin simplified). Provide Jyutping romanization with tone numbers.`;

const BREAKDOWN_SYSTEM_PROMPT = `You are a Cantonese language teacher. For each Cantonese segment given, provide its Jyutping pronunciation and a short English meaning. Return ONLY a JSON object with this exact structure: {"chunks":[{"characters":"幾時輪到我呀","pronunciation":"gei2 si4 lun4 dou3 ngo5 aa3","meaning":"when is it my turn"}]}. Preserve the order and exact characters of each segment.`;

const EXAMPLE_META_SYSTEM_PROMPT =
  'Given a Cantonese sentence, return JSON with exactly two fields: "translation" (natural English meaning) and "pronunciation" (full Jyutping romanization with tone numbers). Return ONLY valid JSON, no other text.';

function buildScoringSystemPrompt(charCount: number): string {
  return `You are a fair Cantonese language examiner. Given an expected Cantonese phrase and what the student actually said (transcribed by speech recognition), score their accuracy from 0 to 100.

The expected phrase has ${charCount} characters.

Scoring rules:
- Award 100 if the student said exactly the expected phrase.
- Award 80–95 if the student said the same phrase with minor differences (extra/missing particles like 啦/喇/嘞/呀/吖, slight word order variation, or Mandarin↔Cantonese equivalent characters).
- Mandarin↔Cantonese substitutions should be treated LENIENTLY (only -2 points each). Common pairs: 的↔嘅, 不↔唔, 是↔係, 在↔喺, 了↔咗, 他/她↔佢, 这↔呢/呢個, 那↔嗰, 没↔冇, 和↔同, 什么↔咩/乜, 哪↔邊. These often come from speech recognition errors, not student mistakes.
- Sentence-final particles (啦/喇/嘞, 喎/噃, 咩/嘛, 㗎/架/嘎, 囉/咯) are interchangeable — no deduction.
- Award 50–79 if the student said most of the key content words but missed some or added extras.
- Award 20–49 if the student captured the general topic but missed significant portions.
- Award 0–19 only if the student said something completely unrelated to the expected phrase.
- Ignore punctuation differences entirely.
- Be generous — this is a language learner using speech recognition which may introduce transcription errors.
- Return ONLY a JSON object: {"score": 75}`;
}

const STT_PROMPT =
  "以下係廣東話口語，用繁體中文書寫。唔該晒，係咁㗎啦，我喺度等緊你，佢哋去咗邊呀，冇問題嘅，嗰個係咩嚟㗎，我唔知點解會咁，好耐冇見啦，你食咗飯未呀，我想去嗰度睇吓。";

const MANDARIN_TO_CANTONESE: Record<string, string> = {
  "的": "嘅", "不": "唔", "是": "係", "在": "喺", "了": "咗",
  "他": "佢", "她": "佢", "它": "佢", "这": "呢", "那": "嗰",
  "没": "冇", "和": "同", "哪": "邊", "吗": "咩", "呢": "呢",
  "们": "哋", "着": "住", "过": "過", "给": "畀", "让": "畀",
  "很": "好", "什": "咩", "么": "嘢", "里": "度", "裡": "度",
  "这个": "呢個", "那个": "嗰個", "什么": "咩",
};

const PARTICLE_GROUPS: string[][] = [
  ["啦", "喇", "嘞", "啊"],
  ["喎", "噃"],
  ["咩", "嘛", "嗎"],
  ["㗎", "架", "嘎", "嫁"],
  ["囉", "咯", "囖"],
  ["呀", "吖", "啊"],
  ["喺", "系", "係"],
];

export const CANTONESE_PACK = {
  code: "yue-HK",
  label: "Cantonese",
  tts: {
    languageCode: "yue-HK",
    voices: VOICES,
    defaultVoice: "zephyr" as const,
    legacyVoiceMap: LEGACY_VOICE_MAP,
  },
  stt: {
    language: "zh",
    prompt: STT_PROMPT,
  },
  romanization: {
    name: "Jyutping",
  },
  prompts: {
    translateSystem: TRANSLATE_SYSTEM_PROMPT,
    breakdownSystem: BREAKDOWN_SYSTEM_PROMPT,
    buildScoringSystem: buildScoringSystemPrompt,
    exampleMetaSystem: EXAMPLE_META_SYSTEM_PROMPT,
  },
  scoring: {
    charEquivalents: MANDARIN_TO_CANTONESE,
    particleGroups: PARTICLE_GROUPS,
  },
} satisfies LanguagePack;
