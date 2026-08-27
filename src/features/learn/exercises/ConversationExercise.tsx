import { useState } from "react";
import { MessageCircle } from "lucide-react";
import type { LessonLevel } from "../../../types";
import { PlayButton, PlayButtonDark } from "../shared";
import { ChatBubble } from "./ChatBubble";

// ─── Conversation Exercise ────────────────────────────────────────────────────

export function ConversationExercise({
  level,
  onComplete,
}: {
  level: LessonLevel;
  onComplete: () => void;
  onBack: () => void;
}) {
  const turns = level.conversation ?? [];
  const [step, setStep] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const current = turns[step];
  const isUserTurn = current?.speaker === "user";
  const isLast = step === turns.length - 1;

  const handleNext = () => {
    if (isLast) {
      onComplete();
      return;
    }
    setStep((s) => s + 1);
    setShowHint(false);
    setRevealed(false);
  };

  // A level with no authored conversation would otherwise render nothing,
  // stranding the user on an empty pane (same empty state as FillBlank).
  if (!current) {
    return (
      <div className="flex flex-col items-center justify-center p-6 gap-4">
        <p className="text-muted-foreground">No conversation available.</p>
        <button onClick={onComplete} className="bg-brand-blue/100 text-white px-6 py-3 rounded-2xl font-bold">
          Complete Level
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-6 gap-4">
      <div className="flex items-center gap-2 mb-2">
        <MessageCircle size={16} className="text-brand-blue/60" />
        <p className="text-sm text-muted-foreground">Step through the conversation</p>
        <span className="ml-auto text-xs text-faint">
          {step + 1} / {turns.length}
        </span>
      </div>

      <div className="flex flex-col gap-3 max-h-[38vh] overflow-y-auto">
        {turns.slice(0, step).map((turn, i) => (
          <ChatBubble key={i} turn={turn} dimmed />
        ))}
      </div>

      <div className="bg-card rounded-3xl shadow-sm border border-brand-blue/15 p-5">
        <div className="flex items-center gap-2 mb-3">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${isUserTurn ? "bg-orange-400" : "bg-brand-blue/60"}`}
          >
            {isUserTurn ? "Y" : "T"}
          </div>
          <span className="text-xs font-semibold text-muted-foreground">
            {isUserTurn ? "Your turn" : "They say"}
          </span>
        </div>

        {isUserTurn ? (
          <>
            <p className="text-sm text-muted-foreground mb-3">{current.english}</p>
            {showHint && current.hint && (
              <p className="text-xs text-brand-blue italic mb-3">Hint: {current.hint}</p>
            )}
            {revealed ? (
              <div className="bg-brand-blue/10 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-2xl font-bold text-brand-blue">{current.dialect}</p>
                  <PlayButton text={current.dialect} size="sm" />
                </div>
                <p className="text-sm font-mono text-brand-blue/60">{current.romanization}</p>
              </div>
            ) : (
              <div className="flex gap-2">
                {!showHint && current.hint && (
                  <button
                    onClick={() => setShowHint(true)}
                    className="flex-1 py-2.5 rounded-xl border border-border text-muted-foreground text-sm font-semibold hover:bg-background active:scale-95 transition-all"
                  >
                    Hint
                  </button>
                )}
                <button
                  onClick={() => setRevealed(true)}
                  className="flex-1 py-2.5 rounded-xl bg-brand-blue/100 text-white text-sm font-bold hover:bg-brand-blue active:scale-95 transition-all"
                >
                  Reveal
                </button>
              </div>
            )}
          </>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-2xl font-bold text-foreground">{current.dialect}</p>
              <PlayButtonDark text={current.dialect} withSlow />
            </div>
            <p className="text-sm font-mono text-faint mb-2">{current.romanization}</p>
            <p className="text-sm text-muted-foreground italic">{current.english}</p>
          </div>
        )}
      </div>

      <button
        onClick={handleNext}
        disabled={isUserTurn && !revealed}
        className={`w-full py-3 rounded-2xl font-bold text-sm shadow transition-all active:scale-95
          ${!isUserTurn || revealed ? "bg-brand-blue/100 text-white hover:bg-brand-blue" : "bg-muted text-faint cursor-not-allowed"}
        `}
      >
        {isLast ? "Complete Conversation" : "Next"}
      </button>

      <div className="flex gap-1 justify-center flex-wrap">
        {turns.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all
              ${i === step ? "w-6 bg-brand-blue/100" : i < step ? "w-2 bg-brand-blue/20" : "w-2 bg-secondary"}
            `}
          />
        ))}
      </div>
    </div>
  );
}
