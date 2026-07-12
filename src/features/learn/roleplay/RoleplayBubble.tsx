import { useState } from "react";
import { Languages, Loader2, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useActiveLanguagePack } from "../../../hooks/useActiveLanguageCode";
import type { RoleplayTurn } from "../../../services/roleplayService";
import { PlayButtonDark } from "../shared";

const GOOD_SCORE = 80;
const OK_SCORE = 60;

function coachChipClasses(score: number): string {
  if (score >= GOOD_SCORE) return "bg-green-50 border-green-200 text-green-700";
  if (score >= OK_SCORE) return "bg-amber-50 border-amber-200 text-amber-700";
  return "bg-orange-50 border-orange-200 text-orange-700";
}

function CoachChip({ turn }: { turn: RoleplayTurn }) {
  if (turn.isCoachPending) {
    return (
      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-faint">
        <Loader2 size={11} className="animate-spin" />
        Coaching…
      </div>
    );
  }
  if (!turn.coach) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`mt-1 max-w-[85%] rounded-xl border px-3 py-2 ${coachChipClasses(turn.coach.score)}`}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <Sparkles size={11} className="flex-shrink-0" />
        <span className="text-[11px] font-bold">{turn.coach.score}/100</span>
      </div>
      <p className="text-[11px] leading-snug">{turn.coach.tip}</p>
    </motion.div>
  );
}

export function RoleplayBubble({ turn }: { turn: RoleplayTurn }) {
  // Avatar glyph follows the active pack (粵 for Cantonese, 閩 for Hokkien).
  const { character } = useActiveLanguagePack();
  const [isGlossVisible, setIsGlossVisible] = useState(false);

  if (turn.speaker === "user") {
    return (
      <div className="flex flex-col items-end">
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          className="max-w-[78%] bg-brand-blue/100 text-white rounded-2xl rounded-br-sm px-4 py-2.5 shadow-sm"
        >
          <p className="text-sm font-semibold">{turn.text}</p>
        </motion.div>
        <CoachChip turn={turn} />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-end gap-2 justify-start"
    >
      <div className="w-8 h-8 rounded-full bg-brand-red/15 flex items-center justify-center flex-shrink-0 mb-1 text-xs font-bold text-brand-red">
        {character}
      </div>
      <div className="max-w-[78%] bg-card rounded-2xl rounded-bl-sm shadow-sm border border-border px-4 py-3">
        <p className="text-base font-semibold text-foreground leading-snug">{turn.text}</p>
        {turn.romanization && (
          <p className="text-xs font-mono text-brand-blue/60 mt-1">{turn.romanization}</p>
        )}
        <div className="mt-2 pt-2 border-t border-border-subtle flex items-center gap-2">
          <PlayButtonDark text={turn.text} size="sm" />
          {turn.english && (
            <button
              onClick={() => setIsGlossVisible((v) => !v)}
              className={`flex items-center gap-1 text-xs rounded-full px-2 py-1 transition-colors ${
                isGlossVisible ? "bg-brand-blue/10 text-brand-blue" : "text-faint hover:text-muted-foreground"
              }`}
            >
              <Languages size={12} />
              {isGlossVisible ? "Hide" : "English"}
            </button>
          )}
        </div>
        {isGlossVisible && turn.english && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="text-xs text-brand-blue mt-2 font-medium"
          >
            {turn.english}
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}
