import { Pencil } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface PendingEnglishOverlayProps {
  isOpen: boolean;
  pendingEditText: string;
  setPendingEditText: (value: string) => void;
  isEditingPending: boolean;
  setIsEditingPending: (value: boolean) => void;
  /** Active pack's display label, e.g. "Cantonese" — same reactive source ActionBar's dialectLabel uses. */
  dialectLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PendingEnglishOverlay({
  isOpen,
  pendingEditText,
  setPendingEditText,
  isEditingPending,
  setIsEditingPending,
  dialectLabel,
  onConfirm,
  onCancel,
}: PendingEnglishOverlayProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: "100%" }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border-t border-border-subtle z-30 pt-8 pb-12 px-6 flex flex-col items-center"
        >
          <div className="text-center mb-6 w-full">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold mb-3 bg-brand-blue/15 text-brand-blue">
              Non-Dialect speaker
            </div>
            <h3 className="text-2xl font-bold text-foreground mb-1">Did you say this?</h3>
            <p className="text-sm text-muted-foreground">Check your recording, then send in {dialectLabel}</p>
          </div>
          <div className="w-full max-w-md mb-8">
            {isEditingPending ? (
              <input
                type="text"
                value={pendingEditText}
                onChange={(e) => setPendingEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onConfirm();
                  }
                }}
                aria-label="Edit your recognised words"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: focus follows the just-revealed edit input
                autoFocus
                className="w-full bg-brand-blue/10 border-2 border-brand-blue rounded-2xl px-5 py-4 text-lg font-semibold text-foreground text-center focus:outline-none"
              />
            ) : (
              <div className="flex items-center gap-3 bg-brand-blue/10 border border-brand-blue/20 rounded-2xl px-5 py-4">
                <p className="flex-1 text-lg font-semibold text-foreground text-center">{pendingEditText}</p>
                <button
                  onClick={() => setIsEditingPending(true)}
                  aria-label="Edit recognised words"
                  className="flex-shrink-0 p-1.5 rounded-lg text-brand-blue/60 hover:text-brand-blue hover:bg-brand-blue/15 transition-colors"
                >
                  <Pencil size={16} />
                </button>
              </div>
            )}
          </div>
          <button
            onClick={onConfirm}
            className="w-full max-w-md py-3.5 bg-brand-blue text-white rounded-2xl font-semibold text-base hover:bg-brand-blue/90 transition-colors"
          >
            Send in {dialectLabel}
          </button>
          <button
            onClick={onCancel}
            className="mt-4 text-faint font-medium text-sm hover:text-muted-foreground"
          >
            Cancel
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
