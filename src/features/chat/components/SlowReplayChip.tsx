import React from "react";
import { Turtle } from "lucide-react";

interface SlowReplayChipProps {
  disabled: boolean;
  /** "light" for white incoming bubbles, "dark" for the blue outgoing bubble. */
  variant: "light" | "dark";
  onPlay: () => void;
}

/**
 * Secondary replay affordance: plays the dialect line at 0.7x speed via fresh
 * TTS (never the cached normal-speed clip). Same chip pattern is used on the
 * learn PlayButton (src/features/learn/shared.tsx).
 */
export function SlowReplayChip({ disabled, variant, onPlay }: SlowReplayChipProps) {
  const colors =
    variant === "dark"
      ? "border-white/25 text-white/60 hover:text-white"
      : "border-zinc-200 text-zinc-400 hover:text-zinc-600";
  return (
    <button
      onClick={onPlay}
      onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
      disabled={disabled}
      aria-label="Replay slowly (0.7x speed)"
      title="Replay slowly (0.7x)"
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold disabled:opacity-50 transition-colors ${colors}`}
    >
      <Turtle size={11} />
      0.7×
    </button>
  );
}
