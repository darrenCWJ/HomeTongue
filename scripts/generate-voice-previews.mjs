/**
 * Run once to pre-generate voice preview audio files.
 * Usage: VITE_ELEVEN_LABS_API=<your-key> node scripts/generate-voice-previews.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "../public/voice-previews");

const API_KEY = process.env.VITE_ELEVEN_LABS_API;
if (!API_KEY) {
  console.error("Error: set VITE_ELEVEN_LABS_API before running this script.");
  process.exit(1);
}

const PREVIEW_TEXT = "你好，好高興認識你！";
const TTS_MODEL = "eleven_multilingual_v2";

const VOICES = [
  { id: "n4xdXKggn5lFcXFYE4TA", name: "Chloe Chan" },
  { id: "xDISamJf8LV5rG5A2te1", name: "Aki" },
  { id: "YxbjaPemDJV2xlfvkiIG", name: "Yun" },
  { id: "OjkyUe8dIihIFvOisuvM", name: "Tung Wong" },
  { id: "R5E9sH7cGUEbuu7YE7K7", name: "Lucky Chan" },
  { id: "cHDwXsKG0qHMNLIjOusN", name: "Lucky Chan Intense" },
];

async function generatePreview(voice) {
  const outPath = path.join(OUTPUT_DIR, `${voice.id}.mp3`);

  if (fs.existsSync(outPath)) {
    console.log(`  skip  ${voice.name} (already exists)`);
    return;
  }

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.id}`, {
    method: "POST",
    headers: {
      "xi-api-key": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: PREVIEW_TEXT,
      model_id: TTS_MODEL,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`  fail  ${voice.name}: ${res.status} ${err}`);
    return;
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buffer);
  console.log(`  done  ${voice.name} → ${path.basename(outPath)} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

console.log(`Generating previews for ${VOICES.length} voices...`);
for (const voice of VOICES) {
  await generatePreview(voice);
}
console.log("Done.");
