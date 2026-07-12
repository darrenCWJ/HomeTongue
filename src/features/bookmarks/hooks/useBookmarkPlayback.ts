import { useState } from "react";
import { toast } from "sonner";
import type { Session, UserProfile } from "../../../types";
import { playDataUrl } from "../../../hooks/audio";
import { speakText } from "../../../hooks/useGoogleTTS";

interface BookmarkPlaybackParams {
  sessions: Session[];
  userProfile: UserProfile | null;
}

/**
 * Audio playback with a single-player lock (`playingId`): phrase playback
 * falls back from stored clips → the source session message's clips → fresh
 * TTS; message playback plays stored clips or falls back to TTS of the text.
 */
export function useBookmarkPlayback({ sessions, userProfile }: BookmarkPlaybackParams) {
  const [playingId, setPlayingId] = useState<string | null>(null);

  const handleSpeak = async (
    phraseId: string,
    text: string,
    audioDataUrl?: string,
    audioDataUrls?: string[]
  ) => {
    if (playingId) return;
    setPlayingId(phraseId);
    try {
      let urls = audioDataUrls ?? [];
      if (urls.length === 0) {
        const msg = sessions.flatMap((s) => s.messages).find((m) => m.id === phraseId);
        urls = msg?.audioDataUrls ?? (msg?.audioDataUrl ? [msg.audioDataUrl] : []);
      }
      if (urls.length === 0 && audioDataUrl) {
        urls = [audioDataUrl];
      }
      if (urls.length > 0) {
        for (const url of urls) {
          await playDataUrl(url);
        }
      } else {
        await speakText(text, userProfile?.preferredVoiceId);
      }
    } catch {
      toast.error("Audio playback failed. Check your connection.");
    } finally {
      setPlayingId(null);
    }
  };

  const playMessage = async (
    msgId: string,
    audioDataUrl?: string,
    audioDataUrls?: string[],
    fallbackText?: string
  ) => {
    if (playingId) return;
    setPlayingId(msgId);
    try {
      const urls = audioDataUrls ?? (audioDataUrl ? [audioDataUrl] : []);
      if (urls.length > 0) {
        for (const url of urls) {
          await playDataUrl(url);
        }
      } else if (fallbackText) {
        await speakText(fallbackText, userProfile?.preferredVoiceId);
      }
    } catch {
      toast.error("Audio playback failed.");
    } finally {
      setPlayingId(null);
    }
  };

  return { playingId, handleSpeak, playMessage };
}
