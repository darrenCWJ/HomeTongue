import { blobToDataUrl } from "./audio";
import { apiUrl } from "../lib/api";

const LANGUAGE_CODE = "yue-HK";

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

export const DEFAULT_VOICE: VoiceKey = "zephyr";

const ELEVENLABS_VOICE_MAP: Record<string, VoiceKey> = {
  "21m00Tcm4TlvDq8ikWAM": "zephyr",
};

export function mapElevenLabsVoice(elevenLabsId: string): VoiceKey {
  return ELEVENLABS_VOICE_MAP[elevenLabsId] ?? DEFAULT_VOICE;
}

/**
 * Resolve any stored voice identifier (VoiceKey, legacy ElevenLabs ID, or
 * undefined) to a valid VoiceKey, falling back to the default voice.
 */
export function asVoiceKey(id: string | undefined | null): VoiceKey {
  if (!id) return DEFAULT_VOICE;
  if (id in GOOGLE_TTS_VOICES) return id as VoiceKey;
  return ELEVENLABS_VOICE_MAP[id] ?? DEFAULT_VOICE;
}

// ──────────────────────────────────────────────────────────
// Core synthesis — proxied through /api/tts to avoid CORS
// ──────────────────────────────────────────────────────────
async function synthesizeToBlob(text: string, voiceKey: VoiceKey): Promise<Blob> {
  const voice = GOOGLE_TTS_VOICES[voiceKey] ?? GOOGLE_TTS_VOICES[DEFAULT_VOICE];
  const voiceName = voice.name;

  let res: Response;
  try {
    res = await fetch(apiUrl("/api/tts"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceName, languageCode: LANGUAGE_CODE }),
    });
  } catch (e) {
    throw new Error(`TTS request failed: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`TTS failed (${res.status}): ${error}`);
  }

  const data = await res.json();
  if (!data.audioContent || typeof data.audioContent !== "string") {
    throw new Error(`TTS response missing audioContent: ${JSON.stringify(data).slice(0, 200)}`);
  }

  const binary = atob(data.audioContent);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes.buffer], { type: "audio/mpeg" });
}

// ──────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────
export async function speakTextAndCapture(
  text: string,
  voice: string = DEFAULT_VOICE
): Promise<{ audioDataUrl: string; play: () => Promise<void> }> {
  const audioBlob = await synthesizeToBlob(text, asVoiceKey(voice));
  const audioDataUrl = await blobToDataUrl(audioBlob);
  const audioUrl = URL.createObjectURL(audioBlob);

  const play = () =>
    new Promise<void>((resolve, reject) => {
      const audio = new Audio(audioUrl);
      audio.onended = () => { URL.revokeObjectURL(audioUrl); resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(audioUrl); reject(new Error("Audio playback failed")); };
      audio.play().catch(reject);
    });

  return { audioDataUrl, play };
}

export async function speakText(
  text: string,
  voice: string = DEFAULT_VOICE
): Promise<void> {
  const audioBlob = await synthesizeToBlob(text, asVoiceKey(voice));
  const audioUrl = URL.createObjectURL(audioBlob);

  await new Promise<void>((resolve, reject) => {
    const audio = new Audio(audioUrl);
    audio.onended = () => { URL.revokeObjectURL(audioUrl); resolve(); };
    audio.onerror = () => { URL.revokeObjectURL(audioUrl); reject(new Error("Audio playback failed")); };
    audio.play().catch(reject);
  });
}
