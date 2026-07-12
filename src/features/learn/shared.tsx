import React, { useState } from "react";
import { Loader2, Volume2 } from "lucide-react";
import { useProfile } from "../../app/context/ProfileProvider";
import { useActiveCapabilities } from "../../hooks/useActiveLanguageCode";
import { playDataUrl } from "../../hooks/audio";
import { speakText, GOOGLE_TTS_VOICES, DEFAULT_VOICE } from "../../hooks/useGoogleTTS";
import type { VoiceKey } from "../../hooks/useGoogleTTS";
import { toast } from "sonner";

export const personalise = (text: string, name: string | undefined) =>
  text.replace(/\{\{name\}\}/g, name || "you");

export function PlayButton({
  text,
  size = "md",
  audioDataUrl,
}: {
  text: string;
  size?: "sm" | "md";
  audioDataUrl?: string;
}) {
  const { userProfile } = useProfile();
  const { tts } = useActiveCapabilities();
  const [isPlaying, setIsPlaying] = useState(false);
  // Voice-less packs (capabilities.tts false): speakText would silently
  // no-op, which reads as a broken button — render nothing instead. Cached
  // audio (recordings / previously captured TTS) stays playable.
  if (!tts && !audioDataUrl) return null;

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) return;
    setIsPlaying(true);
    try {
      if (audioDataUrl) {
        await playDataUrl(audioDataUrl);
      } else {
        await speakText(text, safeVoiceKey(userProfile?.preferredVoiceId));
      }
    } catch (err) {
      toast.error(`Audio failed: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setIsPlaying(false);
    }
  };

  const sizeClasses = size === "sm" ? "w-7 h-7" : "w-9 h-9";

  const iconSize = size === "sm" ? 14 : 16;

  return (
    <button
      onClick={handlePlay}
      onPointerDown={(e) => e.stopPropagation()}
      disabled={isPlaying}
      className={`${sizeClasses} rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors flex-shrink-0`}
    >
      {isPlaying ? <Loader2 size={iconSize} className="animate-spin" /> : <Volume2 size={iconSize} />}
    </button>
  );
}

export function PlayButtonDark({
  text,
  size = "md",
  audioDataUrl,
  disabled: externalDisabled,
}: {
  text: string;
  size?: "sm" | "md";
  audioDataUrl?: string;
  disabled?: boolean;
}) {
  const { userProfile } = useProfile();
  const { tts } = useActiveCapabilities();
  const [isPlaying, setIsPlaying] = useState(false);
  const disabled = isPlaying || !!externalDisabled;
  // Same capability gate as PlayButton above.
  if (!tts && !audioDataUrl) return null;

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    setIsPlaying(true);
    try {
      if (audioDataUrl) {
        await playDataUrl(audioDataUrl);
      } else {
        await speakText(text, safeVoiceKey(userProfile?.preferredVoiceId));
      }
    } catch (err) {
      toast.error(`Audio failed: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setIsPlaying(false);
    }
  };

  const sizeClasses = size === "sm" ? "w-7 h-7" : "w-8 h-8";
  const iconSize = size === "sm" ? 13 : 15;

  return (
    <button
      onClick={handlePlay}
      onPointerDown={(e) => e.stopPropagation()}
      disabled={disabled}
      className={`${sizeClasses} rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${disabled && externalDisabled ? "bg-zinc-100 text-zinc-300 cursor-not-allowed" : "bg-brand-blue/15 hover:bg-brand-blue/20 text-brand-blue"}`}
    >
      {isPlaying ? (
        <Loader2 size={iconSize} className="animate-spin text-brand-blue/60" />
      ) : (
        <Volume2 size={iconSize} />
      )}
    </button>
  );
}

function safeVoiceKey(id: string | undefined): VoiceKey {
  if (id && id in GOOGLE_TTS_VOICES) return id as VoiceKey;
  return DEFAULT_VOICE;
}
