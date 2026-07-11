import { motion, AnimatePresence } from "motion/react";
import { DIALECTS } from "../../../types";

interface DialectSheetProps {
  isOpen: boolean;
  dialect: string;
  onSelectDialect: (dialect: string) => void;
  onClose: () => void;
}

export function DialectSheet({ isOpen, dialect, onSelectDialect, onClose }: DialectSheetProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="dialect-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/30 z-30"
            onClick={onClose}
          />
          <motion.div
            key="dialect-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl z-40 px-6 pt-6 pb-10"
          >
            <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto mb-5" />
            <h3 className="text-lg font-bold text-zinc-800 mb-1">Select Dialect</h3>
            <p className="text-xs text-zinc-500 mb-4">Choose which dialect to translate into.</p>

            <div className="space-y-2">
              {DIALECTS.map((d) => (
                <button
                  key={d.value}
                  disabled={!d.available}
                  onClick={() => {
                    if (d.available) {
                      onSelectDialect(d.value);
                      onClose();
                    }
                  }}
                  className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl border-2 transition-all ${
                    dialect === d.value && d.available
                      ? "bg-brand-blue/10 border-brand-blue"
                      : d.available
                        ? "bg-zinc-50 border-zinc-100 hover:border-zinc-200"
                        : "bg-zinc-50 border-zinc-100 opacity-40 cursor-not-allowed"
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                      dialect === d.value && d.available
                        ? "bg-brand-blue/100 text-white"
                        : d.available
                          ? "bg-zinc-200 text-zinc-600"
                          : "bg-zinc-200 text-zinc-400"
                    }`}
                  >
                    {d.character}
                  </div>
                  <div className="flex-1 text-left">
                    <p
                      className={`text-sm font-semibold ${
                        dialect === d.value && d.available
                          ? "text-brand-blue"
                          : d.available
                            ? "text-zinc-700"
                            : "text-zinc-400"
                      }`}
                    >
                      {d.label}
                    </p>
                    {!d.available && <p className="text-xs text-zinc-400">Coming soon</p>}
                  </div>
                  {dialect === d.value && d.available && (
                    <div className="w-5 h-5 rounded-full bg-brand-blue/100 flex items-center justify-center flex-shrink-0">
                      <div className="w-2 h-2 rounded-full bg-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
