import { motion, AnimatePresence } from "motion/react";

interface PhraseSelectionSheetProps {
  isOpen: boolean;
  phraseSelectionText: string;
  setPhraseSelectionText: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function PhraseSelectionSheet({
  isOpen,
  phraseSelectionText,
  setPhraseSelectionText,
  onSave,
  onCancel,
}: PhraseSelectionSheetProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: "100%" }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border-t border-border-subtle z-[60] pt-8 pb-12 px-6 flex flex-col"
        >
          <div className="text-center mb-5">
            <h3 className="text-xl font-bold text-foreground mb-1">Save as Phrase</h3>
            <p className="text-sm text-muted-foreground">Edit to keep just the part you want</p>
          </div>
          <textarea
            value={phraseSelectionText}
            onChange={(e) => setPhraseSelectionText(e.target.value)}
            aria-label="Phrase text"
            autoFocus
            rows={3}
            className="w-full px-4 py-3 border-2 border-brand-blue/20 rounded-xl focus:border-brand-blue focus:outline-none text-foreground text-base resize-none mb-4"
          />
          <button
            onClick={onSave}
            disabled={!phraseSelectionText.trim()}
            className="w-full py-3.5 bg-brand-blue text-white rounded-2xl font-semibold text-base hover:bg-brand-blue/90 transition-colors disabled:opacity-40 mb-3"
          >
            Save Phrase
          </button>
          <button
            onClick={onCancel}
            className="text-faint font-medium text-sm hover:text-muted-foreground text-center"
          >
            Cancel
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
