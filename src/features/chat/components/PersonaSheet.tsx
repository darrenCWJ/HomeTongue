import { Briefcase, Home } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { PersonaType } from "../../../types";

interface PersonaSheetProps {
  isOpen: boolean;
  activePersona: PersonaType;
  onSelectPersona: (persona: PersonaType) => void;
  onClose: () => void;
}

export function PersonaSheet({ isOpen, activePersona, onSelectPersona, onClose }: PersonaSheetProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="persona-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/30 z-30"
            onClick={onClose}
          />
          <motion.div
            key="persona-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl z-40 px-6 pt-6 pb-10"
          >
            <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto mb-5" />
            <h3 className="text-lg font-bold text-zinc-800 mb-1">Switch Persona</h3>
            <p className="text-xs text-zinc-500 mb-4">
              Changes how the AI interprets your tone and suggestions.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              {(["personal", "work"] as PersonaType[]).map((p) => (
                <button
                  key={p}
                  onClick={() => onSelectPersona(p)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                    activePersona === p
                      ? "bg-brand-blue/10 border-brand-blue shadow-sm"
                      : "bg-zinc-50 border-zinc-100 hover:border-zinc-200"
                  }`}
                >
                  {p === "work" ? (
                    <Briefcase
                      size={24}
                      className={activePersona === p ? "text-brand-blue" : "text-zinc-400"}
                    />
                  ) : (
                    <Home size={24} className={activePersona === p ? "text-brand-blue" : "text-zinc-400"} />
                  )}
                  <span
                    className={`font-semibold text-sm capitalize ${activePersona === p ? "text-brand-blue" : "text-zinc-600"}`}
                  >
                    {p}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
