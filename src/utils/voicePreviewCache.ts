import { speakTextAndCapture, playDataUrl } from "../hooks/useElevenLabs";

// In-memory cache for the current session (covers API fallback path)
const sessionCache = new Map<string, string>();

export async function previewVoice(voiceId: string, text: string): Promise<void> {
  // 1. Try the pre-bundled static file first (zero API cost)
  const staticUrl = `/voice-previews/${voiceId}.mp3`;
  try {
    const res = await fetch(staticUrl, { method: "HEAD" });
    if (res.ok) {
      const audio = new Audio(staticUrl);
      await new Promise<void>((resolve, reject) => {
        audio.onended = resolve;
        audio.onerror = () => reject(new Error("playback failed"));
        audio.play().catch(reject);
      });
      return;
    }
  } catch {
    // static file not available — fall through to API
  }

  // 2. Check in-memory session cache
  const cached = sessionCache.get(voiceId);
  if (cached) {
    await playDataUrl(cached);
    return;
  }

  // 3. Call API, cache result for the rest of the session
  const { audioDataUrl, play } = await speakTextAndCapture(text, voiceId);
  sessionCache.set(voiceId, audioDataUrl);
  await play();
}
