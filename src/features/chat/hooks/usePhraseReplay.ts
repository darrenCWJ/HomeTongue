import { useState } from "react";
import { toast } from "sonner";
import type { Message } from "../../../types";
import { playDataUrl } from "../../../hooks/audio";
import { speakText, SLOW_SPEAKING_RATE } from "../../../hooks/useGoogleTTS";

/**
 * Replay controls for chat bubbles: normal-speed replay (cached clip first,
 * fresh TTS fallback) and slow replay (always fresh TTS at 0.7x — never the
 * cached clip, and never captured, so a message's stored normal-speed audio
 * can't be poisoned with a slow version).
 */
export function usePhraseReplay(messages: Message[], voiceId: string | undefined) {
  const [playingId, setPlayingId] = useState<string | null>(null);

  const replayPhrase = async (id: string, text: string) => {
    if (playingId) return;
    setPlayingId(id);
    try {
      const msg = messages.find((m) => m.id === id);
      // Cached audio was captured for the original text; a switched register
      // variant (different text) must fall through to fresh TTS instead.
      const hasAudioForText = !!msg && text === (msg.dialectText ?? msg.text);
      const urls = hasAudioForText ? (msg.audioDataUrls ?? (msg.audioDataUrl ? [msg.audioDataUrl] : [])) : [];
      if (urls.length > 0) {
        try {
          for (const url of urls) {
            await playDataUrl(url);
          }
          return;
        } catch {
          // cached audio failed, fall through to fresh TTS
        }
      }
      await speakText(text, voiceId);
    } catch {
      toast.error("Audio playback failed.");
    } finally {
      setPlayingId(null);
    }
  };

  const replayPhraseSlow = async (id: string, text: string) => {
    if (playingId) return;
    setPlayingId(id);
    try {
      await speakText(text, voiceId, { speakingRate: SLOW_SPEAKING_RATE });
    } catch {
      toast.error("Audio playback failed.");
    } finally {
      setPlayingId(null);
    }
  };

  return { playingId, setPlayingId, replayPhrase, replayPhraseSlow };
}
