import { playDataUrl } from "../hooks/audio";
import { speakTextAndCapture, asVoiceKey } from "../hooks/useGoogleTTS";

const sessionCache = new Map<string, string>();

export async function previewVoice(voice: string, text: string): Promise<void> {
  const voiceKey = asVoiceKey(voice);
  // 1. Try pre-bundled static file first (zero API cost)
  const staticUrl = `/voice-previews/${voiceKey}.mp3`;
  try {
    const res = await fetch(staticUrl, { method: "HEAD" });
    if (res.ok) {
      const audio = new Audio(staticUrl);
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("playback failed"));
        audio.play().catch(reject);
      });
      return;
    }
  } catch {
    // static file not available — fall through to API
  }

  // 2. Check in-memory session cache
  const cached = sessionCache.get(voiceKey);
  if (cached) {
    await playDataUrl(cached);
    return;
  }

  // 3. Call Google TTS API, cache result for the rest of the session
  const { audioDataUrl, play } = await speakTextAndCapture(text, voiceKey);
  sessionCache.set(voiceKey, audioDataUrl);
  await play();
}
