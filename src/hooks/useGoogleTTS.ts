import { blobToDataUrl } from "./audio";
import { apiUrl } from "../lib/api";
import { ACTIVE_LANGUAGE_PACK } from "../languages";

export type { GoogleTTSVoice } from "../languages";

const LANGUAGE_CODE = ACTIVE_LANGUAGE_PACK.tts.languageCode;

// Stable façade over the active language pack: components, constants/voices.ts,
// and tests import the voice registry from here, not from src/languages/.
export const GOOGLE_TTS_VOICES = ACTIVE_LANGUAGE_PACK.tts.voices;

export type VoiceKey = keyof typeof GOOGLE_TTS_VOICES;

export const DEFAULT_VOICE: VoiceKey = ACTIVE_LANGUAGE_PACK.tts.defaultVoice;

const ELEVENLABS_VOICE_MAP: Record<string, VoiceKey> = ACTIVE_LANGUAGE_PACK.tts.legacyVoiceMap;

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
