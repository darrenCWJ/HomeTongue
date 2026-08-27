import { useState } from "react";
import { toast } from "sonner";
import type { Session, UserProfile } from "../../../types";
import { playDataUrl } from "../../../hooks/audio";
import { speakText } from "../../../hooks/useGoogleTTS";

interface BookmarkPlaybackParams {
  sessions: Session[];
  userProfile: UserProfile | null;
  /**
   * Whether the active language pack has a usable TTS model
   * (useActiveCapabilities().tts). When false, a fresh-TTS fallback would
   * silently no-op (useGoogleTTS.speakText already skips synthesis in that
   * case) — this hook skips the call outright, since PhraseCard/SessionViewer
   * hide the play control for that same no-stored-audio case (BM-02).
   */
  ttsEnabled: boolean;
}

/**
 * Audio playback with a single-player lock (`playingId`): phrase playback
 * falls back from stored clips → the source session message's clips → fresh
 * TTS; message playback plays stored clips or falls back to TTS of the text.
 */
export function useBookmarkPlayback({ sessions, userProfile, ttsEnabled }: BookmarkPlaybackParams) {
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
      } else if (ttsEnabled) {
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
      } else if (fallbackText && ttsEnabled) {
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
