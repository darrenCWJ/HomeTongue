import type { Tone, TranslationResult, WordChunk, Message, VocabItem } from "../types";
import { extractVocabFromMessages } from "../utils/vocab";

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
  const ext = blob.type.includes("mp4") || blob.type.includes("m4a") ? "m4a"
    : blob.type.includes("ogg") ? "ogg"
    : blob.type.includes("wav") ? "wav"
    : "webm";
  const formData = new FormData();
  formData.append("file", blob, `recording.${ext}`);
  formData.append("model", "whisper-1");
  if (language) formData.append("language", language);
  if (prompt) formData.append("prompt", prompt);
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });
  if (!res.ok) throw new Error(`Whisper failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return (data.text as string).trim();
}

export function transcribeCantonese(blob: Blob): Promise<string> {
  return transcribeAudio(blob, "zh", "廣東話口語，繁體中文。你好呀，唔該晒，係咁㗎，我喺度，好靚呀，咁樣囉。");
}

export function transcribeEnglish(blob: Blob): Promise<string> {
  return transcribeAudio(blob, "en");
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

export async function scoreCantoneseAccuracy(expected: string, actual: string): Promise<number> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (!apiKey || apiKey === "your-openai-api-key-here") {
    return simpleFallbackScore(expected, actual);
  }
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
            content: `You are a strict Cantonese language examiner. Given an expected Cantonese phrase and what the student actually said, score their accuracy from 0 to 100 based ONLY on whether they said the correct words.

Scoring rules:
- Score based strictly on character-level and word-level accuracy. Do NOT give credit for similar meaning, intent, or context.
- If the student said a completely different phrase (even if it's valid Cantonese), score 0–10.
- Full marks (100) only if all characters match exactly.
- Each missing or wrong character deducts points proportionally (e.g. if 5 characters expected and 2 are wrong, score ~60).
- Heavily penalise Mandarin substitutions: e.g. 的 instead of 嘅, 不 instead of 唔, 是 instead of 係, 在 instead of 喺. Each costs 20–30 points.
- Extra words that weren't in the expected phrase deduct 5–10 points each.
- Ignore punctuation differences.
- Return ONLY a JSON object: {"score": 85}`,
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
    if (!res.ok) return simpleFallbackScore(expected, actual);
    const data = await res.json();
    const raw = (data.choices[0]?.message?.content as string) ?? "{}";
    const parsed = JSON.parse(raw);
    const gptScore = typeof parsed.score === "number" ? Math.min(100, Math.max(0, Math.round(parsed.score))) : simpleFallbackScore(expected, actual);
    const charScore = simpleFallbackScore(expected, actual);
    return Math.min(gptScore, charScore + 20);
  } catch {
    return simpleFallbackScore(expected, actual);
  }
}

function simpleFallbackScore(expected: string, actual: string): number {
  const CHINESE = /[一-鿿㐀-䶿]/g;
  const expectedChars = expected.match(CHINESE) ?? [];
  if (expectedChars.length === 0) return 0;
  const pool = (actual.match(CHINESE) ?? []).slice();
  let correct = 0;
  for (const ch of expectedChars) {
    const i = pool.indexOf(ch);
    if (i !== -1) { correct++; pool.splice(i, 1); }
  }
  return Math.round((correct / expectedChars.length) * 100);
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
