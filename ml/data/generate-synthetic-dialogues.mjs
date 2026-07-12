// Synthetic HK-colloquial dialogue generator (docs/ML_TRAINING_PLAN.md step 1).
// Builds the SFT corpus for the step-3 conversation model before real user
// data reaches scale.
//
// Usage:
//   OPENAI_API_KEY=sk-... node ml/data/generate-synthetic-dialogues.mjs \
//     [--count 20] [--model gpt-4o-mini] [--out ml/data/out]
//
// Output: <out>/dialogues.jsonl — one dialogue per line:
//   { topic, register, turns: [{ speaker, cantonese, jyutping, english }] }
// Dialogues failing the colloquialness filter are written to rejected.jsonl
// for inspection instead of being silently dropped.

import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("Set OPENAI_API_KEY.");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const normalization = JSON.parse(readFileSync(join(here, "../eval/normalization.json"), "utf8"));

const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const count = Number(argValue("--count", "20"));
const model = argValue("--model", "gpt-4o-mini");
const outDir = argValue("--out", join(here, "out"));

const TOPICS = [
  "ordering at a cha chaan teng", "asking grandma about her week", "taking the MTR to Mong Kok",
  "bargaining at a wet market", "family dinner small talk", "asking for directions in Sham Shui Po",
  "phoning a relative for Lunar New Year", "talking about the weather and typhoons",
  "helping an elderly neighbour with groceries", "chatting about HK milk tea vs coffee",
  "weekend plans with cousins", "asking a pharmacist about cold medicine",
  "complimenting home cooking", "talking about work stress with an auntie",
  "planning a trip to visit family in Guangzhou", "discussing a TVB drama",
];
const REGISTERS = ["casual", "casual", "formal", "slang"];

// Colloquialness filter: a genuine Cantonese dialogue should use dialect
// markers; text drifting into written/Mandarin Chinese gets rejected.
const CANTONESE_MARKERS = ["嘅", "唔", "係", "喺", "咗", "佢", "冇", "嘢", "咁", "啦", "喇", "呀", "㗎", "囉", "哋"];
const MANDARIN_MARKERS = Object.keys(normalization.charEquivalents).filter((c) => c.length === 1);

function colloquialnessCheck(dialogue) {
  const text = dialogue.turns.map((t) => t.cantonese).join("");
  const han = [...text].filter((c) => /\p{Script=Han}/u.test(c));
  if (han.length < 20) return "too little Chinese text";
  const markerCount = [...text].filter((c) => CANTONESE_MARKERS.includes(c)).length;
  if (markerCount / han.length < 0.05) return "not colloquial enough (few Cantonese markers)";
  const mandarinCount = [...text].filter((c) => MANDARIN_MARKERS.includes(c)).length;
  if (mandarinCount > markerCount) return "reads as written/Mandarin Chinese";
  return null;
}

const SYSTEM = `You write authentic colloquial Hong Kong Cantonese dialogues for a heritage-language learning app. Rules:
- Spoken Cantonese in Traditional Chinese, NEVER written/Mandarin Chinese (use 嘅 not 的, 唔 not 不, 係 not 是, 喺 not 在, 咗 not 了, 佢 not 他, 冇 not 没, 嘢 not 東西).
- Natural sentence-final particles (啦/喇/呀/㗎/囉/喎/咩) where a HK speaker would use them.
- 6-10 turns, two speakers ("A" = learner, "B" = native relative/local).
- Every turn needs accurate Jyutping (tone numbers) and a natural English translation.
Return ONLY JSON: {"turns":[{"speaker":"A","cantonese":"...","jyutping":"...","english":"..."}]}`;

async function generate(topic, register) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Topic: ${topic}. Register: ${register}. Generate the dialogue.` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.9,
      max_tokens: 1500,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "dialogues.jsonl");
const rejectFile = join(outDir, "rejected.jsonl");
writeFileSync(outFile, "");
writeFileSync(rejectFile, "");

let accepted = 0, rejected = 0;
for (let i = 0; i < count; i++) {
  const topic = TOPICS[i % TOPICS.length];
  const register = REGISTERS[i % REGISTERS.length];
  try {
    const dialogue = { topic, register, ...(await generate(topic, register)) };
    if (!Array.isArray(dialogue.turns) || dialogue.turns.length < 4) throw new Error("bad shape");
    const rejection = colloquialnessCheck(dialogue);
    if (rejection) {
      appendFileSync(rejectFile, JSON.stringify({ ...dialogue, rejection }) + "\n");
      rejected++;
    } else {
      appendFileSync(outFile, JSON.stringify(dialogue) + "\n");
      accepted++;
    }
    console.log(`[${i + 1}/${count}] ${topic} (${register}) — ${rejection ? "REJECTED: " + rejection : "ok"}`);
  } catch (err) {
    console.warn(`[${i + 1}/${count}] failed: ${err.message}`);
  }
}
console.log(`\n${accepted} accepted → ${outFile}\n${rejected} rejected → ${rejectFile}`);
