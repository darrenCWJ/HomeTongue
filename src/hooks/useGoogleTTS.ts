import { blobToDataUrl } from "./audio";
import { apiUrl } from "../lib/api";
import { DEFAULT_LANGUAGE, LANGUAGE_PACKS, getActiveLanguagePack } from "../languages";
import type { DisplayVoice, GoogleTTSVoice } from "../languages";

export type { DisplayVoice, GoogleTTSVoice } from "../languages";

// Stable façade over the voice registry: components and tests import it from
// here, not from src/languages/. VoiceKey is a
// runtime-validated string (asVoiceKey resolves it against the ACTIVE pack's
// voice registry at call time), not a compile-time literal union — a literal
// union derived from one pack's const-asserted map would make a second pack's
// voice keys untypable.
export type VoiceKey = string;

/**
 * Static snapshot of the DEFAULT pack's voices, kept for backward
 * compatibility with existing imports. Pack-aware code should call
 * getActiveVoices() so a language switch is reflected at call time.
 */
export const GOOGLE_TTS_VOICES: Readonly<Record<string, GoogleTTSVoice>> =
  LANGUAGE_PACKS[DEFAULT_LANGUAGE].tts.voices;

export const DEFAULT_VOICE: VoiceKey = LANGUAGE_PACKS[DEFAULT_LANGUAGE].tts.defaultVoice;

/** Voice registry of the currently active language pack. */
export function getActiveVoices(): Readonly<Record<string, GoogleTTSVoice>> {
  return getActiveLanguagePack().tts.voices;
}

/**
 * Curated voice-picker list (friendly names) of the currently active pack,
 * in display order. Resolved at call time so a language switch is live.
 */
export function getDisplayVoices(): ReadonlyArray<DisplayVoice> {
  return getActiveLanguagePack().tts.displayVoices;
}

export function mapElevenLabsVoice(elevenLabsId: string): VoiceKey {
  const { tts } = getActiveLanguagePack();
  return tts.legacyVoiceMap[elevenLabsId] ?? tts.defaultVoice;
}

/**
 * Resolve any stored voice identifier (VoiceKey, legacy ElevenLabs ID, or
 * undefined) to a valid voice of the ACTIVE pack, falling back to that
 * pack's default voice.
 */
export function asVoiceKey(id: string | undefined | null): VoiceKey {
  const { tts } = getActiveLanguagePack();
  if (!id) return tts.defaultVoice;
  if (id in tts.voices) return id;
  return tts.legacyVoiceMap[id] ?? tts.defaultVoice;
}

// ──────────────────────────────────────────────────────────
// Core synthesis — proxied through /api/tts to avoid CORS
// ──────────────────────────────────────────────────────────
const TTS_TIMEOUT_MS = 15_000;

/**
 * Speaking rate for the "slow replay" affordance. The server validates
 * speakingRate to [0.5, 1.2] (api/_lib/ttsCore.js) — keep in range.
 */
export const SLOW_SPEAKING_RATE = 0.7;

export interface SpeakOptions {
  /**
   * Google TTS speakingRate (1 = normal). Callers requesting a non-default
   * rate must NOT cache the result as the message's normal-speed clip —
   * use speakText (no capture) for slow plays.
   */
  speakingRate?: number;
}

// Packs without a usable TTS model (capabilities.tts === false) must never
// hit /api/tts and must never throw — callers just get silence. Warn once
// per session so the skipped synthesis is still visible to developers.
let hasWarnedTtsUnavailable = false;

function isTtsUnavailable(): boolean {
  const pack = getActiveLanguagePack();
  if (pack.capabilities.tts) return false;
  if (!hasWarnedTtsUnavailable) {
    hasWarnedTtsUnavailable = true;
    console.warn(
      `[useGoogleTTS] Language pack "${pack.code}" has no TTS model (capabilities.tts=false); skipping synthesis.`
    );
  }
  return true;
}

async function synthesizeToBlob(text: string, voiceKey: VoiceKey, options: SpeakOptions = {}): Promise<Blob> {
  if (isTtsUnavailable()) return new Blob([], { type: "audio/mpeg" });
  const pack = getActiveLanguagePack();
  const voice = pack.tts.voices[voiceKey] ?? pack.tts.voices[pack.tts.defaultVoice];
  const voiceName = voice.name;
  const { speakingRate } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(apiUrl("/api/tts"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voiceName,
        languageCode: pack.tts.languageCode,
        ...(typeof speakingRate === "number" ? { speakingRate } : {}),
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error("Voice playback took too long and was cancelled. Please try again.", { cause: e });
    }
    throw new Error(`TTS request failed: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  } finally {
    clearTimeout(timer);
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
  voice: string = DEFAULT_VOICE,
  options: SpeakOptions = {}
): Promise<{ audioDataUrl: string; play: () => Promise<void> }> {
  if (isTtsUnavailable()) {
    return { audioDataUrl: "", play: () => Promise.resolve() };
  }
  const audioBlob = await synthesizeToBlob(text, asVoiceKey(voice), options);
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
  voice: string = DEFAULT_VOICE,
  options: SpeakOptions = {}
): Promise<void> {
  if (isTtsUnavailable()) return;
  const audioBlob = await synthesizeToBlob(text, asVoiceKey(voice), options);
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
