// Shared handler core for /api/tts. Used by api/tts.js (Vercel) and the
// vite.config.ts dev middleware so dev and production run identical logic:
// validation, allowlists, caps, Google OAuth token exchange (with caching),
// synthesis call, and error mapping. Rate limiting stays in the production
// adapter (api/tts.js).
//
// Files under api/_lib are not exposed as routes by Vercel.

import { createSign } from "crypto";
import { fetchWithTimeout, UpstreamTimeoutError } from "./fetchWithTimeout.js";
import { findManifestEntry } from "./languageManifest.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TTS_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";

const MAX_TEXT_LENGTH = 500;

const TOKEN_TTL_SECONDS = 3_600;
const TOKEN_EXPIRY_MARGIN_MS = 5 * 60 * 1000;
const TOKEN_TIMEOUT_MS = 10_000;
const SYNTH_TIMEOUT_MS = 15_000;

// Module-scope access-token cache: Google OAuth tokens are valid for ~1 hour,
// so signing a fresh JWT and exchanging it on every request is wasted work.
// Keyed by client_email so a rotated service account invalidates the cache.
// Re-minted only within TOKEN_EXPIRY_MARGIN_MS of expiry.
let tokenCache = { key: null, token: null, expiresAtMs: 0 };

function base64url(str) {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function getAccessToken(rawPrivateKey, clientEmail) {
  const nowMs = Date.now();
  if (
    tokenCache.key === clientEmail &&
    tokenCache.token &&
    nowMs < tokenCache.expiresAtMs - TOKEN_EXPIRY_MARGIN_MS
  ) {
    return tokenCache.token;
  }

  // Normalize: server env vars often store \n as literal backslash-n
  const privateKey = rawPrivateKey.replace(/\\n/g, "\n");

  const now = Math.floor(nowMs / 1000);
  const signingInput = [
    base64url(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    base64url(
      JSON.stringify({
        iss: clientEmail,
        scope: SCOPE,
        aud: TOKEN_URL,
        exp: now + TOKEN_TTL_SECONDS,
        iat: now,
      })
    ),
  ].join(".");

  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  const sig = sign.sign(privateKey, "base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const res = await fetchWithTimeout(
    TOKEN_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${signingInput}.${sig}`,
    },
    TOKEN_TIMEOUT_MS
  );

  if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
  const data = await res.json();
  const expiresInSec = typeof data.expires_in === "number" ? data.expires_in : TOKEN_TTL_SECONDS;
  tokenCache = { key: clientEmail, token: data.access_token, expiresAtMs: nowMs + expiresInSec * 1000 };
  return data.access_token;
}

/**
 * Pure request core: no req/res, no rate limiting, no process.env.
 *
 * @param {unknown} body parsed JSON request body
 * @param {Record<string, string | undefined>} env reads GOOGLE_API_JSON,
 *   VITE_GOOGLE_API_JSON
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
export async function ttsCore(body, env) {
  const saJson = env.GOOGLE_API_JSON ?? env.VITE_GOOGLE_API_JSON;
  if (!saJson) {
    return { status: 500, body: { error: "TTS is not configured on the server" } };
  }

  let sa;
  try {
    sa = JSON.parse(saJson);
  } catch {
    return { status: 500, body: { error: "TTS server configuration is invalid" } };
  }

  const { text, voiceName, languageCode } = body ?? {};
  if (
    typeof text !== "string" ||
    !text.trim() ||
    typeof voiceName !== "string" ||
    typeof languageCode !== "string"
  ) {
    return { status: 400, body: { error: "Missing required fields: text, voiceName, languageCode" } };
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return { status: 400, body: { error: `Text exceeds ${MAX_TEXT_LENGTH} character limit` } };
  }
  // Allowlists live in the shared manifest (api/_lib/languageManifest.js) so
  // the server stays in lockstep with the client pack registry. The voice must
  // match the pattern of the REQUESTED language, not just any known language.
  const manifestEntry = findManifestEntry(languageCode);
  if (!manifestEntry) {
    return { status: 400, body: { error: "Unsupported language code" } };
  }
  if (!manifestEntry.ttsVoicePattern.test(voiceName)) {
    return { status: 400, body: { error: "Unsupported voice" } };
  }

  let token;
  try {
    token = await getAccessToken(sa.private_key, sa.client_email);
  } catch (err) {
    if (err instanceof UpstreamTimeoutError) {
      return { status: 504, body: { error: "Speech synthesis timed out" } };
    }
    throw err;
  }

  let ttsRes;
  try {
    ttsRes = await fetchWithTimeout(
      TTS_ENDPOINT,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode, name: voiceName },
          audioConfig: { audioEncoding: "MP3" },
        }),
      },
      SYNTH_TIMEOUT_MS
    );
  } catch (err) {
    if (err instanceof UpstreamTimeoutError) {
      return { status: 504, body: { error: "Speech synthesis timed out" } };
    }
    throw err;
  }

  if (!ttsRes.ok) {
    console.error("[api/tts] upstream error:", ttsRes.status, await ttsRes.text());
    return { status: 502, body: { error: "Speech synthesis failed" } };
  }

  const data = await ttsRes.json();
  return { status: 200, body: { audioContent: data.audioContent } };
}
