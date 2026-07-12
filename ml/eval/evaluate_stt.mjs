// STT benchmark harness — the single source of truth for whether any
// custom model beats the current baseline (docs/ML_TRAINING_PLAN.md step 1).
//
// Usage:
//   node scripts/export-training-data.mjs --out training-export   # (needs service key)
//   node ml/eval/evaluate_stt.mjs --in training-export/speech_samples.jsonl
//
// Scores `transcript` against the reference: `corrected` when the user
// fixed the transcript (human-verified truth), else `expected` (exam
// target). Reports CER with dialect-aware normalization, split by source,
// plus the correlation between CER and the app's LLM-assigned exam score.

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createNormalizer, characterErrorRate } from "./cer.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const normalization = JSON.parse(readFileSync(join(here, "normalization.json"), "utf8"));
const normalize = createNormalizer(normalization);

const args = process.argv.slice(2);
const inIdx = args.indexOf("--in");
const inputPath = inIdx !== -1 ? args[inIdx + 1] : "training-export/speech_samples.jsonl";

let lines;
try {
  lines = readFileSync(inputPath, "utf8").split("\n").filter(Boolean);
} catch {
  console.error(`Cannot read ${inputPath}. Run scripts/export-training-data.mjs first.`);
  process.exit(1);
}

const rows = lines.map((l) => JSON.parse(l));
const scored = [];
for (const r of rows) {
  const reference = r.corrected || r.expected;
  if (!reference || !r.transcript) continue;
  const cer = characterErrorRate(reference, r.transcript, normalize);
  if (cer === null) continue;
  scored.push({ ...r, reference, cer });
}

if (scored.length === 0) {
  console.log(`No scoreable samples in ${rows.length} rows yet — collect exam attempts first.`);
  process.exit(0);
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const pct = (x) => `${(x * 100).toFixed(1)}%`;

console.log(`\n=== STT benchmark: ${inputPath} ===`);
console.log(`samples scored: ${scored.length} / ${rows.length} exported rows`);
console.log(`mean CER:   ${pct(mean(scored.map((s) => s.cer)))}`);
console.log(`median CER: ${pct(median(scored.map((s) => s.cer)))}`);
console.log(`perfect (CER=0): ${pct(scored.filter((s) => s.cer === 0).length / scored.length)}`);

for (const source of [...new Set(scored.map((s) => s.source))]) {
  const subset = scored.filter((s) => s.source === source);
  console.log(`  by source ${source}: n=${subset.length}, mean CER ${pct(mean(subset.map((s) => s.cer)))}`);
}

const withScore = scored.filter((s) => typeof s.score === "number");
if (withScore.length >= 10) {
  const xs = withScore.map((s) => s.cer);
  const ys = withScore.map((s) => s.score);
  const mx = mean(xs), my = mean(ys);
  const cov = mean(xs.map((x, i) => (x - mx) * (ys[i] - my)));
  const sx = Math.sqrt(mean(xs.map((x) => (x - mx) ** 2)));
  const sy = Math.sqrt(mean(ys.map((y) => (y - my) ** 2)));
  const r = sx && sy ? cov / (sx * sy) : 0;
  console.log(`CER vs exam score correlation (Pearson r): ${r.toFixed(3)} over ${withScore.length} samples`);
  console.log(`(strongly negative is expected — high error → low score)`);
}

console.log(`\nworst 10 samples (highest CER):`);
for (const s of [...scored].sort((a, b) => b.cer - a.cer).slice(0, 10)) {
  console.log(`  [${pct(s.cer)}] expected: ${s.reference}`);
  console.log(`           heard:    ${s.transcript}`);
}
console.log();
