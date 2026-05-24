import type { Tone, TranslationResult, WordChunk, Message, VocabItem } from "../types";
import { extractVocabFromMessages } from "../utils/vocab";
import { blobToWav } from "../hooks/useElevenLabs";

const OPENAI_BASE = "https://api.openai.com/v1";

const SYSTEM_PROMPT = `You are a dialect translation assistant. When given an English phrase, return ONLY a JSON object (no markdown, no explanation) with this exact structure:
{
  "formal": { "text": "<Traditional Chinese>", "pronunciation": "<Jyutping>" },
  "casual": { "text": "<Traditional Chinese>", "pronunciation": "<Jyutping>" },
  "slang": { "text": "<Traditional Chinese>", "pronunciation": "<Jyutping>" },
  "predictedResponse": "<A likely reply a native speaker would give, in Traditional Chinese>",
  "context": "<3-5 word usage context in English>"
}
Use Traditional Chinese characters (not Mandarin simplified). Provide Jyutping romanization with tone numbers.`;

async function translateWithOpenAI(text: string): Promise<TranslationResult> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (!apiKey) throw new Error("VITE_OPENAI_API_KEY not configured");

  const model =
    (import.meta.env.VITE_OPENAI_MODEL as string | undefined) ?? "gpt-4o-mini";

  let response: Response;
  try {
    response = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Translate to dialect: "${text}"` },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });
  } catch (e) {
    throw new Error(`OpenAI fetch failed (network/CORS): ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const raw = data.choices[0]?.message?.content ?? "";
  return JSON.parse(raw) as TranslationResult;
}

function translateWithMock(text: string): TranslationResult {
  const lower = text.toLowerCase();

  if (/^(hello|hi|hey)[!?.,\s]*$/.test(lower)) {
    return {
      formal: { text: "您好！", pronunciation: "nei5 hou2!" },
      casual: { text: "喂，你好呀！", pronunciation: "wai3, nei5 hou2 aa3!" },
      slang: { text: "哈囉！", pronunciation: "haa1 lo3!" },
      predictedResponse: "你好！你係邊位？",
      context: "Greeting someone",
    };
  }

  if (lower.includes("thank")) {
    return {
      formal: { text: "多謝您。", pronunciation: "do1 ze6 nei5." },
      casual: { text: "唔該晒！", pronunciation: "m4 goi1 saai3!" },
      slang: { text: "多謝哂！", pronunciation: "do1 ze6 saai3!" },
      predictedResponse: "唔使客氣！",
      context: "Expressing gratitude",
    };
  }

  if (lower.includes("sorry") || lower.includes("excuse me")) {
    return {
      formal: { text: "對唔住。", pronunciation: "deoi3 m4 zyu6." },
      casual: { text: "唔好意思！", pronunciation: "m4 hou2 ji3 si1!" },
      slang: { text: "Sorry呀！", pronunciation: "so1 li3 aa3!" },
      predictedResponse: "冇問題，唔緊要！",
      context: "Apologising",
    };
  }

  if (lower.includes("how much") || lower.includes("price") || lower.includes("cost")) {
    return {
      formal: { text: "請問這個多少錢？", pronunciation: "cing2 man6 ze5 go3 do1 siu2 cin2?" },
      casual: { text: "幾多錢呀？", pronunciation: "gei2 do1 cin2 aa3?" },
      slang: { text: "幾錢？", pronunciation: "gei2 cin2?" },
      predictedResponse: "呢個係五十蚊。",
      context: "Asking the price",
    };
  }

  if (lower.includes("station") || lower.includes("train") || lower.includes("mtr")) {
    return {
      formal: { text: "請問地鐵站在哪裡？", pronunciation: "cing2 man6 dei6 tit3 zaam6 hai2 bin1 dou6?" },
      casual: { text: "地鐵站喺邊度呀？", pronunciation: "dei6 tit3 zaam6 hai2 bin1 dou6 aa3?" },
      slang: { text: "地鐵站去邊？", pronunciation: "dei6 tit3 zaam6 heoi3 bin1?" },
      predictedResponse: "直行，向左轉就係喇。",
      context: "Finding the MTR",
    };
  }

  if (
    lower.includes("food") ||
    lower.includes("eat") ||
    lower.includes("hungry") ||
    lower.includes("restaurant")
  ) {
    return {
      formal: { text: "我想用餐。", pronunciation: "ngo5 soeng2 jung6 caan1." },
      casual: { text: "我想食嘢。", pronunciation: "ngo5 soeng2 sik6 je5." },
      slang: { text: "食嘢先！", pronunciation: "sik6 je5 sin1!" },
      predictedResponse: "去附近間茶餐廳啦！",
      context: "Wanting to eat",
    };
  }

  return {
    formal: { text: text, pronunciation: "..." },
    casual: { text: text, pronunciation: "..." },
    slang: { text: text, pronunciation: "..." },
    predictedResponse: "係咩？",
    context: "General phrase",
  };
}

async function transcribeAudio(blob: Blob, language: string | null, prompt?: string): Promise<string> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (!apiKey || apiKey === "your-openai-api-key-here") {
    throw new Error("VITE_OPENAI_API_KEY not configured");
  }
  const wavBlob = await blobToWav(blob);
  const formData = new FormData();
  formData.append("file", wavBlob, "recording.wav");
  formData.append("model", "gpt-4o-transcribe");
  if (language) formData.append("language", language);
  if (prompt) formData.append("prompt", prompt);
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });
  if (!res.ok) throw new Error(`Transcription failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return (data.text as string).trim();
}

export function transcribeEnglish(blob: Blob): Promise<string> {
  return transcribeAudio(blob, "en");
}

const CANTONESE_PROMPT = "以下係廣東話口語，用繁體中文書寫。唔該晒，係咁㗎啦，我喺度等緊你，佢哋去咗邊呀，冇問題嘅，嗰個係咩嚟㗎，我唔知點解會咁，好耐冇見啦，你食咗飯未呀，我想去嗰度睇吓。";

// Whisper sometimes echoes back its prompt instead of transcribing when audio is unclear.
// Detect this by checking whether >60% of adjacent CJK char pairs in the result also appear in the prompt.
function isPromptHallucination(text: string, prompt: string): boolean {
  const cjk = (s: string) => [...s].filter(c => /\p{Script=Han}/u.test(c)).join("");
  const textCJK = cjk(text);
  const promptCJK = cjk(prompt);
  if (textCJK.length < 4) return false;
  let matches = 0;
  for (let i = 0; i < textCJK.length - 1; i++) {
    if (promptCJK.includes(textCJK[i] + textCJK[i + 1])) matches++;
  }
  return matches / (textCJK.length - 1) > 0.6;
}

export async function transcribeCantonese(blob: Blob): Promise<string> {
  const result = await transcribeAudio(blob, "zh", CANTONESE_PROMPT);
  return isPromptHallucination(result, CANTONESE_PROMPT) ? "" : result;
}

export async function transcribeWithModel(blob: Blob, model: string, language: string): Promise<string> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (!apiKey || apiKey === "your-openai-api-key-here") {
    throw new Error("VITE_OPENAI_API_KEY not configured");
  }
  const wavBlob = await blobToWav(blob);
  const formData = new FormData();
  formData.append("file", wavBlob, "recording.wav");
  formData.append("model", model);
  if (language) formData.append("language", language);
  if (language === "zh") formData.append("prompt", CANTONESE_PROMPT);
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });
  if (!res.ok) throw new Error(`Transcription failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const text = (data.text as string).trim();
  if (language === "zh" && isPromptHallucination(text, CANTONESE_PROMPT)) return "";
  return text;
}

export async function translateCantoneseToEnglish(text: string): Promise<string> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (!apiKey || apiKey === "your-openai-api-key-here") return `[${text}]`;
  const model = (import.meta.env.VITE_OPENAI_MODEL as string | undefined) ?? "gpt-4o-mini";
  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "Translate the following dialect text to natural English. Return only the English translation, nothing else.",
        },
        { role: "user", content: text },
      ],
      temperature: 0.3,
      max_tokens: 200,
    }),
  });
  if (!res.ok) return `[${text}]`;
  const data = await res.json();
  return ((data.choices[0]?.message?.content as string) ?? text).trim();
}

function splitByPunctuation(cantonese: string): string[] {
  return cantonese
    .split(/[，,。！!？?…、—；;：:]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function generateWordBreakdown(
  cantonese: string,
  _pronunciation: string,
  _english: string
): Promise<WordChunk[]> {
  const segments = splitByPunctuation(cantonese);
  const fallback = segments.map((seg) => ({ characters: seg, pronunciation: "", meaning: "" }));

  const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (!apiKey || apiKey === "your-openai-api-key-here") return fallback;

  const model = (import.meta.env.VITE_OPENAI_MODEL as string | undefined) ?? "gpt-4o-mini";
  try {
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `You are a Cantonese language teacher. For each Cantonese segment given, provide its Jyutping pronunciation and a short English meaning. Return ONLY a JSON object with this exact structure: {"chunks":[{"characters":"幾時輪到我呀","pronunciation":"gei2 si4 lun4 dou3 ngo5 aa3","meaning":"when is it my turn"}]}. Preserve the order and exact characters of each segment.`,
          },
          {
            role: "user",
            content: `Segments: ${JSON.stringify(segments)}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 600,
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const raw = (data.choices[0]?.message?.content as string) ?? "{}";
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.chunks) && parsed.chunks.length > 0 ? parsed.chunks : fallback;
  } catch {
    return fallback;
  }
}

const MANDARIN_TO_CANTONESE: Record<string, string> = {
  "的": "嘅", "不": "唔", "是": "係", "在": "喺", "了": "咗",
  "他": "佢", "她": "佢", "它": "佢", "这": "呢", "那": "嗰",
  "没": "冇", "和": "同", "哪": "邊", "吗": "咩", "呢": "呢",
  "们": "哋", "着": "住", "过": "過", "给": "畀", "让": "畀",
  "很": "好", "什": "咩", "么": "嘢", "里": "度", "裡": "度",
  "这个": "呢個", "那个": "嗰個", "什么": "咩",
};

const PARTICLE_GROUPS = [
  ["啦", "喇", "嘞", "啊"],
  ["喎", "噃"],
  ["咩", "嘛", "嗎"],
  ["㗎", "架", "嘎", "嫁"],
  ["囉", "咯", "囖"],
  ["呀", "吖", "啊"],
  ["喺", "系", "係"],
];

function normalizeChar(ch: string): string {
  const mapped = MANDARIN_TO_CANTONESE[ch];
  if (mapped) return mapped;
  for (const group of PARTICLE_GROUPS) {
    if (group.includes(ch)) return group[0];
  }
  return ch;
}

function charMatchScore(expected: string, actual: string): number {
  const CHINESE = /[一-鿿㐀-䶿]/g;
  const expectedChars = (expected.match(CHINESE) ?? []).map(normalizeChar);
  if (expectedChars.length === 0) return 0;
  const actualChars = (actual.match(CHINESE) ?? []).map(normalizeChar);
  if (actualChars.length === 0) return 0;

  const pool = [...actualChars];
  let matched = 0;
  for (const ch of expectedChars) {
    const i = pool.indexOf(ch);
    if (i !== -1) {
      matched++;
      pool.splice(i, 1);
    }
  }
  return Math.round((matched / expectedChars.length) * 100);
}

export async function scoreCantoneseAccuracy(expected: string, actual: string): Promise<number> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (!apiKey || apiKey === "your-openai-api-key-here") {
    return charMatchScore(expected, actual);
  }
  const model = (import.meta.env.VITE_OPENAI_MODEL as string | undefined) ?? "gpt-4o-mini";
  const charCount = [...expected.replace(/[，。！？、；：""''（）\s]/g, "")].length;
  try {
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `You are a fair Cantonese language examiner. Given an expected Cantonese phrase and what the student actually said (transcribed by speech recognition), score their accuracy from 0 to 100.

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
- Return ONLY a JSON object: {"score": 75}`,
          },
          {
            role: "user",
            content: `Expected: ${expected}\nStudent said: ${actual}`,
          },
        ],
        temperature: 0,
        max_tokens: 20,
      }),
    });
    if (!res.ok) return charMatchScore(expected, actual);
    const data = await res.json();
    const raw = (data.choices[0]?.message?.content as string) ?? "{}";
    const parsed = JSON.parse(raw);
    return typeof parsed.score === "number" ? Math.min(100, Math.max(0, Math.round(parsed.score))) : charMatchScore(expected, actual);
  } catch {
    return charMatchScore(expected, actual);
  }
}

export async function getExampleMeta(cantonese: string): Promise<{ translation: string; pronunciation: string }> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (!apiKey || apiKey === "your-openai-api-key-here") return { translation: "", pronunciation: "" };
  const model = (import.meta.env.VITE_OPENAI_MODEL as string | undefined) ?? "gpt-4o-mini";
  try {
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: 'Given a Cantonese sentence, return JSON with exactly two fields: "translation" (natural English meaning) and "pronunciation" (full Jyutping romanization with tone numbers). Return ONLY valid JSON, no other text.',
          },
          { role: "user", content: cantonese },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 200,
      }),
    });
    if (!res.ok) return { translation: "", pronunciation: "" };
    const data = await res.json() as { choices: { message: { content: string } }[] };
    const content = JSON.parse(data.choices[0]?.message?.content ?? "{}") as { translation?: string; pronunciation?: string };
    return {
      translation: content.translation ?? "",
      pronunciation: content.pronunciation ?? "",
    };
  } catch {
    return { translation: "", pronunciation: "" };
  }
}

export interface TranslateOptions {
  text: string;
  preferredTone: Tone;
}

export async function translate(options: TranslateOptions): Promise<TranslationResult> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (!apiKey) {
    return translateWithMock(options.text);
  }
  return await translateWithOpenAI(options.text);
}

const PART_SIZE = 15;

export async function curateAndGroupVocab(msgs: Message[]): Promise<VocabItem[][]> {
  const allVocab = extractVocabFromMessages(msgs);
  if (allVocab.length === 0) return [];
  if (allVocab.length <= PART_SIZE) return [allVocab];

  const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (!apiKey || apiKey === "your-openai-api-key-here") return sequentialSplit(allVocab);

  const model = (import.meta.env.VITE_OPENAI_MODEL as string | undefined) ?? "gpt-4o-mini";
  const phraseList = allVocab.map((v, i) => `${i}: ${v.cantonese} — ${v.english}`).join("\n");

  try {
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `You are a Cantonese language teacher. Group the following numbered phrases into thematic lesson parts for a language learner. Each part should have at most ${PART_SIZE} phrases. Keep contextually related phrases together (e.g. greetings, food, transport, family). Return ONLY valid JSON: {"parts":[[0,1,2],[3,4,5]]}. Use every index exactly once.`,
          },
          {
            role: "user",
            content: `Group these ${allVocab.length} phrases:\n${phraseList}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 1000,
      }),
    });
    if (!res.ok) return sequentialSplit(allVocab);
    const data = await res.json();
    const raw = (data.choices[0]?.message?.content as string) ?? "{}";
    const parsed = JSON.parse(raw) as { parts: number[][] };
    if (!Array.isArray(parsed.parts)) return sequentialSplit(allVocab);
    return parsed.parts.map((indices) => indices.map((i) => allVocab[i]).filter(Boolean));
  } catch {
    return sequentialSplit(allVocab);
  }
}

function sequentialSplit(vocab: VocabItem[]): VocabItem[][] {
  const parts: VocabItem[][] = [];
  for (let i = 0; i < vocab.length; i += PART_SIZE) parts.push(vocab.slice(i, i + PART_SIZE));
  return parts;
}
