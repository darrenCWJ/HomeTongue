import { createSign } from "crypto";
import { isRateLimited, requestIp } from "./_lib/rateLimit.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TTS_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";

const MAX_TEXT_LENGTH = 500;
const ALLOWED_LANGUAGE_CODES = new Set(["yue-HK"]);
const VOICE_NAME_PATTERN = /^yue-HK-Chirp3-HD-[A-Za-z]+$/;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

function base64url(str) {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function getAccessToken(rawPrivateKey, clientEmail) {
  // Normalize: server env vars often store \n as literal backslash-n
  const privateKey = rawPrivateKey.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const signingInput = [
    base64url(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    base64url(JSON.stringify({ iss: clientEmail, scope: SCOPE, aud: TOKEN_URL, exp: now + 3600, iat: now })),
  ].join(".");

  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  const sig = sign.sign(privateKey, "base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${signingInput}.${sig}`,
  });

  if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
  return (await res.json()).access_token;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (await isRateLimited("tts", requestIp(req), RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS)) {
      return res.status(429).json({ error: "Too many requests. Try again shortly." });
    }

    const saJson = process.env.GOOGLE_API_JSON ?? process.env.VITE_GOOGLE_API_JSON;
    if (!saJson) {
      return res.status(500).json({ error: "TTS is not configured on the server" });
    }

    let sa;
    try {
      sa = JSON.parse(saJson);
    } catch {
      return res.status(500).json({ error: "TTS server configuration is invalid" });
    }

    const { text, voiceName, languageCode } = req.body || {};
    if (
      typeof text !== "string" ||
      !text.trim() ||
      typeof voiceName !== "string" ||
      typeof languageCode !== "string"
    ) {
      return res.status(400).json({ error: "Missing required fields: text, voiceName, languageCode" });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({ error: `Text exceeds ${MAX_TEXT_LENGTH} character limit` });
    }
    if (!ALLOWED_LANGUAGE_CODES.has(languageCode)) {
      return res.status(400).json({ error: "Unsupported language code" });
    }
    if (!VOICE_NAME_PATTERN.test(voiceName)) {
      return res.status(400).json({ error: "Unsupported voice" });
    }

    const token = await getAccessToken(sa.private_key, sa.client_email);

    const ttsRes = await fetch(TTS_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode, name: voiceName },
        audioConfig: { audioEncoding: "MP3" },
      }),
    });

    if (!ttsRes.ok) {
      console.error("[api/tts] upstream error:", ttsRes.status, await ttsRes.text());
      return res.status(502).json({ error: "Speech synthesis failed" });
    }

    const data = await ttsRes.json();
    return res.status(200).json({ audioContent: data.audioContent });
  } catch (err) {
    console.error("[api/tts] error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
