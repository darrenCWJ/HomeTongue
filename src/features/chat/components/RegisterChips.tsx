import type { Tone } from "../../../types";

const TONE_OPTIONS: { value: Tone; label: string }[] = [
  { value: "formal", label: "Formal" },
  { value: "casual", label: "Casual" },
  { value: "slang", label: "Slang" },
];

interface RegisterChipsProps {
  selected: Tone;
  onSelect: (tone: Tone) => void;
}

/**
 * Formal / Casual / Slang register switcher rendered inside the blue
 * outgoing translated bubble. Selecting a chip swaps the displayed dialect
 * text (and what TTS replays) to that register variant.
 */
export function RegisterChips({ selected, onSelect }: RegisterChipsProps) {
  return (
    <div className="flex gap-1 mt-2" onPointerDown={(e) => e.stopPropagation()}>
      {TONE_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => onSelect(option.value)}
          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors ${
            selected === option.value
              ? "bg-white text-brand-blue"
              : "bg-white/15 text-white/70 hover:bg-white/25"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
