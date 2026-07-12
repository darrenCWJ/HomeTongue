import type { Message } from "../../../types";

/**
 * Small honest-framing badge for a Dialect-mic transcription that was scored
 * against the user's most recent practice target. "Word match" deliberately
 * avoids claiming pronunciation accuracy — the STT transcript auto-corrects
 * tones, so only word choice is measured.
 */
export function WordMatchBadge({ matchScore }: { matchScore: NonNullable<Message["matchScore"]> }) {
  const isApproximate = matchScore.method === "fallback";
  return (
    <span
      className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue text-[10px] font-semibold"
      title={
        isApproximate
          ? "Approximate offline word match — checks whether you said the right words, not tones."
          : "Word match — checks whether you said the right words, not tones."
      }
    >
      word match {matchScore.score}%{isApproximate && <span className="text-brand-blue/60">· approx.</span>}
    </span>
  );
}
