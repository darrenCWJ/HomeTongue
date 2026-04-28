import { speakTextAndCapture, playDataUrl } from "../hooks/useElevenLabs";

const CACHE_KEY_PREFIX = "ht_voice_preview_";

function getCached(voiceId: string): string | null {
  try {
    return localStorage.getItem(CACHE_KEY_PREFIX + voiceId);
  } catch {
    return null;
  }
}

function setCached(voiceId: string, dataUrl: string) {
  try {
    localStorage.setItem(CACHE_KEY_PREFIX + voiceId, dataUrl);
  } catch {
    // storage quota exceeded — skip caching silently
  }
}

export async function previewVoice(voiceId: string, text: string): Promise<void> {
  const cached = getCached(voiceId);
  if (cached) {
    await playDataUrl(cached);
    return;
  }

  const { audioDataUrl, play } = await speakTextAndCapture(text, voiceId);
  setCached(voiceId, audioDataUrl);
  await play();
}
