import type { Tone, TranslationResult, WordChunk } from "../types";
import { blobToWav, blobToDataUrl } from "../hooks/audio";
import { postJson, ApiError } from "../lib/api";
import { getActiveLanguagePack, type LanguagePack } from "../languages";

// The active pack is read at USE time (inside each function) rather than
// bound at import time, so a per-user language selection change takes effect
// live. Typed as the general contract so nothing below depends on
// Cantonese-specific literal types.

interface ChatRequestOptions {
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" };
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** All OpenAI chat calls go through the server-side /api/chat proxy. */
async function chatCompletion(messages: ChatMessage[], options: ChatRequestOptions = {}): Promise<string> {
  const { content } = await postJson<{ content: string }>("/api/chat", { messages, ...options });
  return content;
}

/** Strip markdown fences the model sometimes wraps around JSON output. */
export function parseModelJson<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned) as T;
}

async function translateWithProxy(text: string): Promise<TranslationResult> {
  const raw = await chatCompletion(
    [
      { role: "system", content: getActiveLanguagePack().prompts.translateSystem },
      { role: "user", content: `Translate to dialect: "${text}"` },
    ],
    { temperature: 0.3, max_tokens: 2000 }
  );
  try {
    return parseModelJson<TranslationResult>(raw);
  } catch {
    throw new Error("Translation returned an unexpected format. Please try again.");
  }
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

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await blobToDataUrl(blob);
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

// Vercel rejects request bodies over 4.5MB at the platform edge (opaque 413),
// so guard before uploading. 4MB of base64 ≈ 3MB of 16kHz WAV ≈ 90+ seconds.
const MAX_UPLOAD_BASE64_CHARS = 4 * 1024 * 1024;

async function transcribeAudio(blob: Blob, language: string | null, prompt?: string): Promise<string> {
  const wavBlob = await blobToWav(blob);
  const audio = await blobToBase64(wavBlob);
  if (audio.length > MAX_UPLOAD_BASE64_CHARS) {
    throw new Error("Recording is too long to transcribe. Please keep recordings under 90 seconds.");
  }
  const { text } = await postJson<{ text: string }>("/api/transcribe", {
    audio,
    ...(language ? { language } : {}),
    ...(prompt ? { prompt } : {}),
  });
  return text.trim();
}

export function transcribeEnglish(blob: Blob): Promise<string> {
  return transcribeAudio(blob, "en");
}

// The transcription model sometimes echoes back its prompt instead of transcribing
// when audio is unclear. Detect this by checking whether >60% of adjacent CJK char
// pairs in the result also appear in the prompt.
export function isPromptHallucination(text: string, prompt: string): boolean {
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
  const pack = getActiveLanguagePack();
  const result = await transcribeAudio(blob, pack.stt.language, pack.stt.prompt);
  return isPromptHallucination(result, pack.stt.prompt) ? "" : result;
}

export function transcribeAnyLanguage(blob: Blob): Promise<string> {
  return transcribeAudio(blob, null);
}

export async function translateCantoneseToEnglish(text: string): Promise<string> {
  try {
    const content = await chatCompletion(
      [
        {
          role: "system",
          content:
            "Translate the following dialect text to natural English. Return only the English translation, nothing else.",
        },
        { role: "user", content: text },
      ],
      { temperature: 0.3, max_tokens: 200 }
    );
    return content.trim() || `[${text}]`;
  } catch {
    return `[${text}]`;
  }
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

  try {
    const raw = await chatCompletion(
      [
        { role: "system", content: getActiveLanguagePack().prompts.breakdownSystem },
        { role: "user", content: `Segments: ${JSON.stringify(segments)}` },
      ],
      { temperature: 0.2, max_tokens: 600 }
    );
    const parsed = parseModelJson<{ chunks?: WordChunk[] }>(raw);
    return Array.isArray(parsed.chunks) && parsed.chunks.length > 0 ? parsed.chunks : fallback;
  } catch {
    return fallback;
  }
}

function normalizeChar(ch: string, pack: LanguagePack): string {
  // Map Mandarin equivalents first, then fold particle-group variants, so
  // e.g. 是→係 and a literal 係 both normalize to the same character.
  const mapped = pack.scoring.charEquivalents[ch] ?? ch;
  for (const group of pack.scoring.particleGroups) {
    if (group.includes(mapped)) return group[0];
  }
  return mapped;
}

export function charMatchScore(expected: string, actual: string): number {
  const pack = getActiveLanguagePack();
  const CHINESE = /[一-鿿㐀-䶿]/g;
  const expectedChars = (expected.match(CHINESE) ?? []).map((ch) => normalizeChar(ch, pack));
  if (expectedChars.length === 0) return 0;
  const actualChars = (actual.match(CHINESE) ?? []).map((ch) => normalizeChar(ch, pack));
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
  const charCount = [...expected.replace(/[，。！？、；：""''（）\s]/g, "")].length;
  try {
    const raw = await chatCompletion(
      [
        { role: "system", content: getActiveLanguagePack().prompts.buildScoringSystem(charCount) },
        { role: "user", content: `Expected: ${expected}\nStudent said: ${actual}` },
      ],
      { temperature: 0, max_tokens: 20 }
    );
    const parsed = parseModelJson<{ score?: number }>(raw);
    return typeof parsed.score === "number"
      ? Math.min(100, Math.max(0, Math.round(parsed.score)))
      : charMatchScore(expected, actual);
  } catch {
    return charMatchScore(expected, actual);
  }
}

export async function getExampleMeta(cantonese: string): Promise<{ translation: string; pronunciation: string }> {
  try {
    const raw = await chatCompletion(
      [
        { role: "system", content: getActiveLanguagePack().prompts.exampleMetaSystem },
        { role: "user", content: cantonese },
      ],
      { response_format: { type: "json_object" }, temperature: 0.1, max_tokens: 200 }
    );
    const content = parseModelJson<{ translation?: string; pronunciation?: string }>(raw);
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
  try {
    return await translateWithProxy(options.text);
  } catch (e) {
    // Server has no OpenAI key configured — fall back to the offline mock
    if (e instanceof ApiError && e.status === 503) {
      return translateWithMock(options.text);
    }
    throw e;
  }
}
