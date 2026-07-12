import React, { useState } from "react";
import { Loader2, Turtle, Volume2 } from "lucide-react";
import { useProfile } from "../../app/context/ProfileProvider";
import { useActiveCapabilities } from "../../hooks/useActiveLanguageCode";
import { playDataUrl } from "../../hooks/audio";
import { speakText, GOOGLE_TTS_VOICES, DEFAULT_VOICE, SLOW_SPEAKING_RATE } from "../../hooks/useGoogleTTS";
import type { VoiceKey } from "../../hooks/useGoogleTTS";
import { toast } from "sonner";

export const personalise = (text: string, name: string | undefined) =>
  text.replace(/\{\{name\}\}/g, name || "you");

/** Slow playback is always fresh TTS — cached clips stay normal-speed. */
async function playTextSlowly(text: string, voiceId: string | undefined, setBusy: (b: boolean) => void) {
  setBusy(true);
  try {
    await speakText(text, safeVoiceKey(voiceId), { speakingRate: SLOW_SPEAKING_RATE });
  } catch (err) {
    toast.error(`Audio failed: ${err instanceof Error ? err.message : "unknown error"}`);
  } finally {
    setBusy(false);
  }
}

/**
 * "0.7x" chip rendered next to full-phrase play controls (same pattern as the
 * chat bubbles' SlowReplayChip). Only rendered when the active pack has TTS.
 */
function SlowPlayChip({
  disabled,
  isPlaying,
  className,
  onPlay,
}: {
  disabled: boolean;
  isPlaying: boolean;
  className: string;
  onPlay: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onPlay}
      onPointerDown={(e) => e.stopPropagation()}
      disabled={disabled}
      aria-label="Play slowly (0.7x speed)"
      title="Play slowly (0.7x)"
      className={`flex items-center gap-1 px-1.5 py-1 rounded-full text-[10px] font-bold transition-colors flex-shrink-0 disabled:opacity-50 ${className}`}
    >
      {isPlaying ? <Loader2 size={11} className="animate-spin" /> : <Turtle size={11} />}
      0.7×
    </button>
  );
}

export function PlayButton({
  text,
  size = "md",
  audioDataUrl,
  withSlow = false,
}: {
  text: string;
  size?: "sm" | "md";
  audioDataUrl?: string;
  /** Show the 0.7x slow-play chip — full-phrase play controls only. */
  withSlow?: boolean;
}) {
  const { userProfile } = useProfile();
  const { tts } = useActiveCapabilities();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayingSlow, setIsPlayingSlow] = useState(false);
  // Voice-less packs (capabilities.tts false): speakText would silently
  // no-op, which reads as a broken button — render nothing instead. Cached
  // audio (recordings / previously captured TTS) stays playable.
  if (!tts && !audioDataUrl) return null;

  const isBusy = isPlaying || isPlayingSlow;

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isBusy) return;
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

  const handlePlaySlow = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isBusy) return;
    playTextSlowly(text, userProfile?.preferredVoiceId, setIsPlayingSlow);
  };

  const sizeClasses = size === "sm" ? "w-7 h-7" : "w-9 h-9";

  const iconSize = size === "sm" ? 14 : 16;

  const playButton = (
    <button
      onClick={handlePlay}
      onPointerDown={(e) => e.stopPropagation()}
      disabled={isBusy}
      className={`${sizeClasses} rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors flex-shrink-0`}
    >
      {isPlaying ? <Loader2 size={iconSize} className="animate-spin" /> : <Volume2 size={iconSize} />}
    </button>
  );

  if (!withSlow || !tts) return playButton;
  return (
    <span className="inline-flex items-center gap-1.5 flex-shrink-0">
      {playButton}
      <SlowPlayChip
        disabled={isBusy}
        isPlaying={isPlayingSlow}
        className="bg-white/20 hover:bg-white/40"
        onPlay={handlePlaySlow}
      />
    </span>
  );
}

export function PlayButtonDark({
  text,
  size = "md",
  audioDataUrl,
  disabled: externalDisabled,
  withSlow = false,
}: {
  text: string;
  size?: "sm" | "md";
  audioDataUrl?: string;
  disabled?: boolean;
  /** Show the 0.7x slow-play chip — full-phrase play controls only. */
  withSlow?: boolean;
}) {
  const { userProfile } = useProfile();
  const { tts } = useActiveCapabilities();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayingSlow, setIsPlayingSlow] = useState(false);
  const disabled = isPlaying || isPlayingSlow || !!externalDisabled;
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

  const handlePlaySlow = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    playTextSlowly(text, userProfile?.preferredVoiceId, setIsPlayingSlow);
  };

  const sizeClasses = size === "sm" ? "w-7 h-7" : "w-8 h-8";
  const iconSize = size === "sm" ? 13 : 15;

  const playButton = (
    <button
      onClick={handlePlay}
      onPointerDown={(e) => e.stopPropagation()}
      disabled={disabled}
      className={`${sizeClasses} rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${disabled && externalDisabled ? "bg-muted text-faint cursor-not-allowed" : "bg-brand-blue/15 hover:bg-brand-blue/20 text-brand-blue"}`}
    >
      {isPlaying ? (
        <Loader2 size={iconSize} className="animate-spin text-brand-blue/60" />
      ) : (
        <Volume2 size={iconSize} />
      )}
    </button>
  );

  if (!withSlow || !tts) return playButton;
  return (
    <span className="inline-flex items-center gap-1.5 flex-shrink-0">
      {playButton}
      <SlowPlayChip
        disabled={disabled}
        isPlaying={isPlayingSlow}
        className={
          disabled && externalDisabled
            ? "bg-muted text-faint cursor-not-allowed"
            : "bg-brand-blue/15 hover:bg-brand-blue/20 text-brand-blue"
        }
        onPlay={handlePlaySlow}
      />
    </span>
  );
}

function safeVoiceKey(id: string | undefined): VoiceKey {
  if (id && id in GOOGLE_TTS_VOICES) return id as VoiceKey;
  return DEFAULT_VOICE;
}
