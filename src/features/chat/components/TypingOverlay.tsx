import { Send } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useActiveCapabilities } from "../../../hooks/useActiveLanguageCode";

interface TypingOverlayProps {
  isOpen: boolean;
  typedReply: string;
  onTypedReplyChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export function TypingOverlay({
  isOpen,
  typedReply,
  onTypedReplyChange,
  onSubmit,
  onClose,
}: TypingOverlayProps) {
  // Voice-less packs (capabilities.tts false) never speak the reply — don't
  // promise audio the app can't deliver.
  const { tts: ttsEnabled } = useActiveCapabilities();
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
            <h3 className="text-2xl font-bold text-foreground mb-1">Your reply</h3>
            <p className="text-sm text-muted-foreground">
              {ttsEnabled
                ? "Type in English — it will be spoken in their dialect"
                : "Type in English — it will be translated into their dialect"}
            </p>
          </div>
          <div className="relative w-full max-w-md">
            <input
              type="text"
              value={typedReply}
              onChange={(e) => onTypedReplyChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              placeholder="e.g. Nice to meet you!"
              aria-label="Your reply in English"
              // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: focus moves into the just-opened reply overlay
              autoFocus
              className="w-full px-4 py-3 pr-12 border-2 border-brand-blue/20 rounded-xl focus:border-brand-blue focus:outline-none text-foreground"
            />
            <button
              onClick={onSubmit}
              disabled={!typedReply.trim()}
              aria-label="Send reply"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-brand-blue text-white rounded-lg hover:bg-brand-blue/90 transition-colors disabled:opacity-50"
            >
              <Send size={18} />
            </button>
          </div>
          <button
            onClick={onClose}
            className="mt-8 text-faint font-medium text-sm hover:text-muted-foreground"
          >
            Cancel
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
