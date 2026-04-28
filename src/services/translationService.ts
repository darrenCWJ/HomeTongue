import type { Tone, TranslationResult } from "../types";

const OPENAI_BASE = "https://api.openai.com/v1";

const SYSTEM_PROMPT = `You are a Cantonese dialect translation assistant. When given an English phrase, return ONLY a JSON object (no markdown, no explanation) with this exact structure:
{
  "formal": { "text": "<Traditional Chinese>", "pronunciation": "<Jyutping>" },
  "casual": { "text": "<Traditional Chinese>", "pronunciation": "<Jyutping>" },
  "slang": { "text": "<Traditional Chinese>", "pronunciation": "<Jyutping>" },
  "predictedResponse": "<A likely Cantonese reply someone would give, in Traditional Chinese>",
  "context": "<3-5 word usage context in English>"
}
Use Traditional Chinese characters for Cantonese (not Mandarin). Provide Jyutping romanization with tone numbers.`;

async function translateWithOpenAI(text: string): Promise<TranslationResult> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (!apiKey) throw new Error("VITE_OPENAI_API_KEY not configured");

  const model =
    (import.meta.env.VITE_OPENAI_MODEL as string | undefined) ?? "gpt-4o-mini";

  const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Translate to Cantonese: "${text}"` },
      ],
      temperature: 0.3,
      max_tokens: 400,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const raw = data.choices[0]?.message?.content ?? "";
  return JSON.parse(raw) as TranslationResult;
}

function translateWithMock(text: string): TranslationResult {
  const lower = text.toLowerCase();

  if (lower.includes("hello") || lower.startsWith("hi") || lower.includes("hey")) {
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

async function transcribeAudio(blob: Blob, language: string): Promise<string> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (!apiKey || apiKey === "your-openai-api-key-here") {
    throw new Error("VITE_OPENAI_API_KEY not configured");
  }
  const formData = new FormData();
  formData.append("file", blob, "recording.webm");
  formData.append("model", "whisper-1");
  formData.append("language", language);
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
  return transcribeAudio(blob, "zh");
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
            "Translate the following Cantonese text to natural English. Return only the English translation, nothing else.",
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

export interface TranslateOptions {
  text: string;
  preferredTone: Tone;
}

export async function translate(options: TranslateOptions): Promise<TranslationResult> {
  try {
    return await translateWithOpenAI(options.text);
  } catch {
    return translateWithMock(options.text);
  }
}
