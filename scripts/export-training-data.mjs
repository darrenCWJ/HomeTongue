// Export the consented speech corpus as JSONL for model fine-tuning.
//
// Usage:
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/export-training-data.mjs [--language yue-HK] [--out data/]
//
// Requires the SERVICE ROLE key (server-side only — never ship it) because
// the export reads across users. Only rows inserted under consent exist in
// these tables (RLS insert policies enforce the profile consent flag).
//
// Output:
//   <out>/speech_samples.jsonl  — {expected, transcript, corrected, score, language, source, audio_url, created_at}
//   <out>/corrections.jsonl     — {kind, original, corrected, rating, context, language, created_at}
// User ids are replaced with a per-export anonymous hash (salted per run) so
// samples from one speaker stay groupable without exposing identity.

import { createHash, randomBytes } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const language = argValue("--language", null);
const outDir = argValue("--out", "training-export");

const salt = randomBytes(16).toString("hex");
const anonId = (userId) => createHash("sha256").update(salt + userId).digest("hex").slice(0, 16);

async function fetchAll(table, languageFilter) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const params = new URLSearchParams({ select: "*", order: "created_at.asc" });
    if (languageFilter) params.set("language", `eq.${languageFilter}`);
    const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${from}-${from + pageSize - 1}`,
      },
    });
    if (!res.ok) throw new Error(`${table} fetch failed (${res.status}): ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

const samples = await fetchAll("speech_samples", language);
const corrections = await fetchAll("corrections", language);

mkdirSync(outDir, { recursive: true });

writeFileSync(
  join(outDir, "speech_samples.jsonl"),
  samples
    .map((r) =>
      JSON.stringify({
        speaker: anonId(r.user_id),
        language: r.language,
        source: r.source,
        expected: r.expected_text,
        transcript: r.transcript,
        corrected: r.corrected_text,
        score: r.score,
        stt_model: r.stt_model,
        audio_url: r.audio_url,
        created_at: r.created_at,
      })
    )
    .join("\n")
);

writeFileSync(
  join(outDir, "corrections.jsonl"),
  corrections
    .map((r) =>
      JSON.stringify({
        speaker: anonId(r.user_id),
        language: r.language,
        kind: r.kind,
        original: r.original,
        corrected: r.corrected,
        rating: r.rating,
        context: r.context,
        created_at: r.created_at,
      })
    )
    .join("\n")
);

console.log(`Exported ${samples.length} speech samples and ${corrections.length} corrections to ${outDir}/`);
