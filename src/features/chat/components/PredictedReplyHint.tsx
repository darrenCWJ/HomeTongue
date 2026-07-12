import { useState } from "react";
import { Volume2, X } from "lucide-react";
import { motion } from "motion/react";

interface PredictedReplyHintProps {
  text: string;
  isPlaying: boolean;
  playDisabled: boolean;
  /** Active pack's TTS capability — the play button is hidden when false. */
  showPlay: boolean;
  onPlay: () => void;
}

/**
 * Subtle dismissible hint shown under the newest translated message with the
 * model's predicted reply from the other speaker. Dismissal is local state,
 * so a new prediction (new component instance keyed by message) resets it.
 */
export function PredictedReplyHint({
  text,
  isPlaying,
  playDisabled,
  showPlay,
  onPlay,
}: PredictedReplyHintProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  if (isDismissed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-start pl-10"
    >
      <div className="flex items-center gap-2 max-w-[78%] bg-muted/80 border border-dashed border-border rounded-2xl rounded-tl-sm px-3 py-2">
        <div className="min-w-0">
          <span className="block text-[10px] font-semibold text-faint uppercase tracking-wide">
            They might reply:
          </span>
          <span className="block text-sm font-medium text-muted-foreground leading-snug">{text}</span>
        </div>
        {showPlay && (
          <button
            onClick={onPlay}
            disabled={playDisabled}
            aria-label="Play predicted reply"
            className="flex-shrink-0 p-1 rounded-full text-faint hover:text-brand-blue disabled:opacity-50 transition-colors"
          >
            <Volume2 size={14} className={isPlaying ? "animate-pulse text-brand-blue" : ""} />
          </button>
        )}
        <button
          onClick={() => setIsDismissed(true)}
          aria-label="Dismiss predicted reply"
          className="flex-shrink-0 p-1 rounded-full text-faint hover:text-muted-foreground transition-colors"
        >
          <X size={12} />
        </button>
      </div>
    </motion.div>
  );
}
