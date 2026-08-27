import { Bookmark, BookmarkCheck, MessageCircle, Star } from "lucide-react";
import { motion } from "motion/react";
import type { RoleplayScenario, RoleplayTurn } from "../../../services/roleplayService";

interface RoleplaySummaryProps {
  scenario: RoleplayScenario;
  turns: RoleplayTurn[];
  /**
   * Ids of turns already saved to the library. Owned by RoleplayView: this
   * component unmounts every time the user goes back to practising, and
   * summary-local state would forget the saves each time.
   */
  savedTurnIds: ReadonlySet<string>;
  onSaveTurn: (turn: RoleplayTurn) => void;
  onKeepPractising: () => void;
  onDone: () => void;
}

export function RoleplaySummary({
  scenario,
  turns,
  savedTurnIds,
  onSaveTurn,
  onKeepPractising,
  onDone,
}: RoleplaySummaryProps) {
  const userTurns = turns.filter((t) => t.speaker === "user");
  const botTurns = turns.filter((t) => t.speaker === "bot");
  const scores = userTurns.map((t) => t.coach?.score).filter((s): s is number => typeof s === "number");
  const avgScore =
    scores.length > 0 ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length) : null;

  const unsavedBotTurns = botTurns.filter((t) => !savedTurnIds.has(t.id));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex-1 overflow-y-auto px-5 py-6 scrollbar-none pb-nav"
    >
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-full bg-brand-blue/10 flex items-center justify-center text-3xl mx-auto mb-3">
          {scenario.emoji}
        </div>
        <h3 className="text-xl font-extrabold text-foreground">Rehearsal complete!</h3>
        <p className="text-sm text-muted-foreground">{scenario.title}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-6">
        <div className="bg-card p-3 rounded-xl shadow-sm border border-border-subtle flex flex-col items-center">
          <div className="w-8 h-8 rounded-full bg-brand-blue/15 flex items-center justify-center mb-1.5">
            <MessageCircle size={16} className="text-brand-blue" />
          </div>
          <span className="text-xl font-bold text-foreground">{userTurns.length}</span>
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
            Your Turns
          </span>
        </div>
        <div className="bg-card p-3 rounded-xl shadow-sm border border-border-subtle flex flex-col items-center">
          <div className="w-8 h-8 rounded-full bg-brand-red/15 flex items-center justify-center mb-1.5">
            <Star size={16} className="text-brand-red" />
          </div>
          <span className="text-xl font-bold text-foreground">
            {avgScore !== null ? `${avgScore}%` : "–"}
          </span>
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
            Avg Score
          </span>
        </div>
      </div>

      {botTurns.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-faint">Save these phrases</p>
            {unsavedBotTurns.length > 0 && (
              <button
                onClick={() => unsavedBotTurns.forEach(onSaveTurn)}
                className="text-xs font-semibold text-brand-blue hover:underline"
              >
                Save all
              </button>
            )}
          </div>
          <div className="space-y-2">
            {botTurns.map((turn) => {
              const isSaved = savedTurnIds.has(turn.id);
              return (
                <div
                  key={turn.id}
                  className="bg-card rounded-2xl p-3.5 shadow-sm border border-border-subtle flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">{turn.text}</p>
                    {turn.romanization && (
                      <p className="text-[11px] font-mono text-brand-blue/60">{turn.romanization}</p>
                    )}
                    {turn.english && <p className="text-xs text-muted-foreground mt-0.5">{turn.english}</p>}
                  </div>
                  <button
                    onClick={() => onSaveTurn(turn)}
                    disabled={isSaved}
                    aria-label={isSaved ? "Saved to phrases" : "Save phrase"}
                    className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSaved
                        ? "bg-green-50 text-green-600"
                        : "bg-brand-blue/10 text-brand-blue hover:bg-brand-blue/20"
                    }`}
                  >
                    {isSaved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onKeepPractising}
          className="flex-1 py-3 rounded-2xl border border-border text-muted-foreground font-semibold text-sm hover:bg-background active:scale-95 transition-all"
        >
          Keep practising
        </button>
        <button
          onClick={onDone}
          className="flex-1 py-3 bg-brand-blue/100 text-white font-bold rounded-2xl shadow hover:bg-brand-blue active:scale-95 transition-all text-sm"
        >
          Done
        </button>
      </div>
    </motion.div>
  );
}
