/**
 * Pre-generate Google TTS voice preview audio files.
 * Usage: node --env-file=.env scripts/generate-voice-previews.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "../public/voice-previews");

const rawJson = process.env.VITE_GOOGLE_API_JSON;
if (!rawJson) {
  console.error("Error: VITE_GOOGLE_API_JSON not set. Run with: node --env-file=.env scripts/generate-voice-previews.mjs");
  process.exit(1);
}

const SERVICE_ACCOUNT = JSON.parse(rawJson);
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TTS_BASE_URL = "https://texttospeech.googleapis.com/v1";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const PREVIEW_TEXT = "你好，好高興認識你！";

const VOICES = [
  // Female
  { key: "zephyr",       name: "yue-HK-Chirp3-HD-Zephyr"       },
  { key: "aoede",        name: "yue-HK-Chirp3-HD-Aoede"        },
  { key: "vindemiatrix", name: "yue-HK-Chirp3-HD-Vindemiatrix" },
  // Male
  { key: "puck",         name: "yue-HK-Chirp3-HD-Puck"         },
  { key: "charon",       name: "yue-HK-Chirp3-HD-Charon"       },
  { key: "fenrir",       name: "yue-HK-Chirp3-HD-Fenrir"       },
];

function base64urlEncode(input) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const binary = Array.from(bytes).map((b) => String.fromCharCode(b)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: SERVICE_ACCOUNT.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const pemContents = SERVICE_ACCOUNT.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\n/g, "")
    .trim();

  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await globalThis.crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${base64urlEncode(new Uint8Array(signature))}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function generatePreview(voice, token) {
  const outPath = path.join(OUTPUT_DIR, `${voice.key}.mp3`);

  if (fs.existsSync(outPath)) {
    console.log(`  skip  ${voice.key} (already exists)`);
    return;
  }

  const res = await fetch(`${TTS_BASE_URL}/text:synthesize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: { text: PREVIEW_TEXT },
      voice: { languageCode: "yue-HK", name: voice.name },
      audioConfig: { audioEncoding: "MP3" },
    }),
  });

  if (!res.ok) {
    console.error(`  fail  ${voice.key}: ${res.status} ${await res.text()}`);
    return;
  }

  const data = await res.json();
  const binary = atob(data.audioContent);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  fs.writeFileSync(outPath, Buffer.from(bytes.buffer));
  console.log(`  done  ${voice.key} → ${voice.key}.mp3`);
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
console.log(`Generating previews for ${VOICES.length} Google TTS voices...`);
const token = await getAccessToken();
for (const voice of VOICES) {
  await generatePreview(voice, token);
}
console.log("Done.");
