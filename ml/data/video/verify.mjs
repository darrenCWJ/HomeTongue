// Optional ASR-agreement filter for ingested clips: blind-transcribe each
// clip through the app's /api/transcribe contract and keep only clips whose
// subtitle text the ASR roughly agrees with (CER ≤ --max-cer). This is what
// rejects music beds, mistimed cues, and translated-not-verbatim subtitles.
//
// The subtitle text is NEVER sent as the STT prompt — a hint would bias the
// model toward agreeing with the very label it is supposed to check.

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createNormalizer } from "../../eval/cer.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Dialect-aware normalizer (shared with the eval harness) for Cantonese;
 * a bare punctuation/whitespace stripper for other languages until they
 * get their own normalization tables.
 */
export function loadNormalizer(language) {
  if (language.startsWith("yue")) {
    const normalization = JSON.parse(readFileSync(join(here, "../../eval/normalization.json"), "utf8"));
    return createNormalizer(normalization);
  }
  return createNormalizer({ charEquivalents: {}, particleGroups: [] });
}

/**
 * POST one WAV clip to a /api/transcribe-shaped endpoint ({ audio, language }
 * → { text }). `language` is the pack code (e.g. "yue-HK") so the server
 * resolves the right STT hint / per-language base URL.
 */
export async function transcribeClip(endpoint, wavPath, language) {
  const audio = readFileSync(wavPath).toString("base64");
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio, language }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`transcribe ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return typeof data.text === "string" ? data.text : "";
}

/**
 * Fail-closed verification gate. "kept" only when verification was not
 * requested at all, or the clip scored within the CER budget. Endpoint
 * errors and unscorable references (CER null — e.g. punctuation-only text)
 * come back "unscored" so callers exclude them from the corpus instead of
 * silently treating "couldn't check" as "checked clean".
 */
export function verifyOutcome(verify, maxCer) {
  if (verify === null || verify === undefined) return "kept"; // --verify not enabled
  if (typeof verify.cer === "number") return verify.cer <= maxCer ? "kept" : "rejected";
  return "unscored";
}
