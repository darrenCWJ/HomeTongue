import { ArrowLeft, ChevronRight, Target } from "lucide-react";
import { motion } from "motion/react";
import { ROLEPLAY_SCENARIOS, type RoleplayScenario } from "../../../services/roleplayService";

interface ScenarioPickerProps {
  onBack: () => void;
  onSelect: (scenario: RoleplayScenario) => void;
}

export function ScenarioPicker({ onBack, onSelect }: ScenarioPickerProps) {
  return (
    <motion.div
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      className="absolute inset-0 bg-zinc-50 z-20 flex flex-col"
    >
      <div className="flex items-center gap-3 p-4 bg-white/80 backdrop-blur-md border-b border-zinc-200 sticky top-0 z-30">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h2 className="font-bold text-lg text-zinc-800 leading-tight">Rehearse a Conversation</h2>
          <p className="text-xs text-zinc-400">Practise the scenario before the real thing</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-none pb-nav">
        {ROLEPLAY_SCENARIOS.map((scenario) => (
          <button
            key={scenario.id}
            onClick={() => onSelect(scenario)}
            className="w-full bg-white rounded-2xl p-4 shadow-sm border border-zinc-100 text-left hover:border-brand-blue/40 active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-brand-blue/10 flex items-center justify-center text-xl flex-shrink-0">
                {scenario.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-800">{scenario.title}</p>
                <p className="text-xs text-zinc-500">{scenario.subtitle}</p>
              </div>
              <ChevronRight size={18} className="text-zinc-300 flex-shrink-0" />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {scenario.goalHints.map((hint) => (
                <span
                  key={hint}
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-500 bg-zinc-50 border border-zinc-100 rounded-full px-2 py-0.5"
                >
                  <Target size={10} className="text-brand-blue/60 flex-shrink-0" />
                  {hint}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
