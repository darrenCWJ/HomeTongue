import { blobToDataUrl } from "./useElevenLabs";

let SERVICE_ACCOUNT: Record<string, string> | null = null;

function getServiceAccount(): Record<string, string> {
  if (SERVICE_ACCOUNT) return SERVICE_ACCOUNT;
  const raw = import.meta.env.VITE_GOOGLE_API_JSON as string | undefined;
  if (!raw) throw new Error("VITE_GOOGLE_API_JSON is not set");
  try {
    SERVICE_ACCOUNT = JSON.parse(raw) as Record<string, string>;
  } catch {
    throw new Error(
      "VITE_GOOGLE_API_JSON contains invalid JSON. It must be a single-line minified string — multi-line .env values are truncated by dotenv."
    );
  }
  return SERVICE_ACCOUNT;
}

const TTS_BASE_URL = "https://texttospeech.googleapis.com/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const LANGUAGE_CODE = "yue-HK";

// ──────────────────────────────────────────────────────────
// Voice pack — Chirp 3: HD voices for Cantonese (yue-HK)
// These names match ElevenLabs voice character equivalents
// ──────────────────────────────────────────────────────────
export interface GoogleTTSVoice {
  name: string;
  gender: "female" | "male";
  style: string;
}

export const GOOGLE_TTS_VOICES = {
  // Female
  zephyr:        { name: "yue-HK-Chirp3-HD-Zephyr",        gender: "female", style: "Bright" },
  kore:          { name: "yue-HK-Chirp3-HD-Kore",          gender: "female", style: "Firm" },
  aoede:         { name: "yue-HK-Chirp3-HD-Aoede",         gender: "female", style: "Breezy" },
  leda:          { name: "yue-HK-Chirp3-HD-Leda",          gender: "female", style: "Youthful" },
  despina:       { name: "yue-HK-Chirp3-HD-Despina",       gender: "female", style: "Smooth" },
  erinome:       { name: "yue-HK-Chirp3-HD-Erinome",       gender: "female", style: "Clear" },
  gacrux:        { name: "yue-HK-Chirp3-HD-Gacrux",        gender: "female", style: "Mature" },
  laomedeia:     { name: "yue-HK-Chirp3-HD-Laomedeia",     gender: "female", style: "Upbeat" },
  pulcherrima:   { name: "yue-HK-Chirp3-HD-Pulcherrima",   gender: "female", style: "Forward" },
  sulafat:       { name: "yue-HK-Chirp3-HD-Sulafat",       gender: "female", style: "Warm" },
  vindemiatrix:  { name: "yue-HK-Chirp3-HD-Vindemiatrix",  gender: "female", style: "Gentle" },
  callirrhoe:    { name: "yue-HK-Chirp3-HD-Callirrhoe",    gender: "female", style: "Easy-going" },
  autonoe:       { name: "yue-HK-Chirp3-HD-Autonoe",       gender: "female", style: "Bright" },
  achernar:      { name: "yue-HK-Chirp3-HD-Achernar",      gender: "female", style: "Soft" },
  // Male
  puck:          { name: "yue-HK-Chirp3-HD-Puck",          gender: "male",   style: "Upbeat" },
  charon:        { name: "yue-HK-Chirp3-HD-Charon",        gender: "male",   style: "Informative" },
  fenrir:        { name: "yue-HK-Chirp3-HD-Fenrir",        gender: "male",   style: "Excitable" },
  orus:          { name: "yue-HK-Chirp3-HD-Orus",          gender: "male",   style: "Firm" },
  enceladus:     { name: "yue-HK-Chirp3-HD-Enceladus",     gender: "male",   style: "Breathy" },
  iapetus:       { name: "yue-HK-Chirp3-HD-Iapetus",       gender: "male",   style: "Clear" },
  algenib:       { name: "yue-HK-Chirp3-HD-Algenib",       gender: "male",   style: "Gravelly" },
  algieba:       { name: "yue-HK-Chirp3-HD-Algieba",       gender: "male",   style: "Smooth" },
  alnilam:       { name: "yue-HK-Chirp3-HD-Alnilam",       gender: "male",   style: "Firm" },
  rasalgethi:    { name: "yue-HK-Chirp3-HD-Rasalgethi",    gender: "male",   style: "Informative" },
  sadachbia:     { name: "yue-HK-Chirp3-HD-Sadachbia",     gender: "male",   style: "Lively" },
  sadaltager:    { name: "yue-HK-Chirp3-HD-Sadaltager",    gender: "male",   style: "Knowledgeable" },
  schedar:       { name: "yue-HK-Chirp3-HD-Schedar",       gender: "male",   style: "Even" },
  umbriel:       { name: "yue-HK-Chirp3-HD-Umbriel",       gender: "male",   style: "Easy-going" },
  zubenelgenubi: { name: "yue-HK-Chirp3-HD-Zubenelgenubi", gender: "male",   style: "Casual" },
  achird:        { name: "yue-HK-Chirp3-HD-Achird",        gender: "male",   style: "Friendly" },
} as const satisfies Record<string, GoogleTTSVoice>;

export type VoiceKey = keyof typeof GOOGLE_TTS_VOICES;

// Default: Zephyr (Bright, Female) — equivalent to ElevenLabs Rachel
export const DEFAULT_VOICE: VoiceKey = "zephyr";

// Maps legacy ElevenLabs voice IDs to Google TTS voice keys
const ELEVENLABS_VOICE_MAP: Record<string, VoiceKey> = {
  "21m00Tcm4TlvDq8ikWAM": "zephyr", // Rachel → Zephyr (Bright Female)
};

export function mapElevenLabsVoice(elevenLabsId: string): VoiceKey {
  return ELEVENLABS_VOICE_MAP[elevenLabsId] ?? DEFAULT_VOICE;
}

// ──────────────────────────────────────────────────────────
// Service account JWT → OAuth2 access token
// ──────────────────────────────────────────────────────────
let cachedToken: { token: string; expiresAt: number } | null = null;

function base64urlEncode(input: Uint8Array | string): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  const binary = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const sa = getServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const pemContents = (sa.private_key as string)
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\n/g, "")
    .trim();

  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
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

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`GCP token exchange failed (${res.status}): ${error}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token as string,
    expiresAt: Date.now() + (data.expires_in as number) * 1000,
  };

  return cachedToken.token;
}

// ──────────────────────────────────────────────────────────
// Core synthesis
// ──────────────────────────────────────────────────────────
async function synthesizeToBlob(text: string, voiceKey: VoiceKey): Promise<Blob> {
  const token = await getAccessToken();
  const voiceName = GOOGLE_TTS_VOICES[voiceKey].name;

  const res = await fetch(`${TTS_BASE_URL}/text:synthesize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: LANGUAGE_CODE, name: voiceName },
      audioConfig: { audioEncoding: "MP3" },
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`TTS failed (${res.status}): ${error}`);
  }

  const data = await res.json();
  const binary = atob(data.audioContent as string);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes.buffer], { type: "audio/mpeg" });
}

// ──────────────────────────────────────────────────────────
// Public API — same signatures as the old useElevenLabs TTS
// ──────────────────────────────────────────────────────────
export async function speakTextAndCapture(
  text: string,
  voiceKey: VoiceKey = DEFAULT_VOICE
): Promise<{ audioDataUrl: string; play: () => Promise<void> }> {
  const audioBlob = await synthesizeToBlob(text, voiceKey);
  const audioDataUrl = await blobToDataUrl(audioBlob);
  const audioUrl = URL.createObjectURL(audioBlob);

  const play = () =>
    new Promise<void>((resolve, reject) => {
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        reject(new Error("Audio playback failed"));
      };
      audio.play().catch(reject);
    });

  return { audioDataUrl, play };
}

export async function speakText(
  text: string,
  voiceKey: VoiceKey = DEFAULT_VOICE
): Promise<void> {
  const audioBlob = await synthesizeToBlob(text, voiceKey);
  const audioUrl = URL.createObjectURL(audioBlob);

  await new Promise<void>((resolve, reject) => {
    const audio = new Audio(audioUrl);
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(audioUrl);
      reject(new Error("Audio playback failed"));
    };
    audio.play().catch(reject);
  });
}
