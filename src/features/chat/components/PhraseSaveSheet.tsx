import React from "react";
import { Check, Plus } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { Tag, TagType } from "../../../types";

interface PhraseSaveSheetProps {
  isOpen: boolean;
  phraseSelectionText: string;
  setPhraseSelectionText: (value: string) => void;
  phraseTags: Tag[];
  phraseTagSelection: string[];
  setPhraseTagSelection: React.Dispatch<React.SetStateAction<string[]>>;
  newTagInput: string;
  setNewTagInput: (value: string) => void;
  isCreatingPhraseTag: boolean;
  setIsCreatingPhraseTag: (value: boolean) => void;
  createTag: (name: string, type: TagType) => Tag;
  /** A save in flight — the button stays down until its audio settles. */
  isSavingPhrase: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export function PhraseSaveSheet({
  isOpen,
  phraseSelectionText,
  setPhraseSelectionText,
  phraseTags,
  phraseTagSelection,
  setPhraseTagSelection,
  newTagInput,
  setNewTagInput,
  isCreatingPhraseTag,
  setIsCreatingPhraseTag,
  createTag,
  isSavingPhrase,
  onSave,
  onCancel,
}: PhraseSaveSheetProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: "100%" }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border-t border-border-subtle z-30 pt-8 pb-12 px-6 flex flex-col"
        >
          <div className="text-center mb-5">
            <h3 className="text-xl font-bold text-foreground mb-1">Save as Phrase</h3>
            <p className="text-sm text-muted-foreground">Edit to keep just the part you want</p>
          </div>
          <textarea
            value={phraseSelectionText}
            onChange={(e) => setPhraseSelectionText(e.target.value)}
            autoFocus
            rows={3}
            className="w-full px-4 py-3 border-2 border-brand-blue/20 rounded-xl focus:border-brand-blue focus:outline-none text-foreground text-base resize-none mb-4"
          />
          {/* Group caption, not a form label — the "controls" are toggle buttons. */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Tags</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {phraseTags.map((tag) => {
              const isSelected = phraseTagSelection.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() =>
                    setPhraseTagSelection((prev) =>
                      isSelected ? prev.filter((t) => t !== tag.id) : [...prev, tag.id]
                    )
                  }
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    isSelected
                      ? "bg-brand-blue text-white border-brand-blue"
                      : "bg-card text-muted-foreground border-border hover:border-brand-blue/20"
                  }`}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 mb-5">
            {isCreatingPhraseTag ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTagInput.trim()) {
                      const tag = createTag(newTagInput.trim(), "phrase");
                      setPhraseTagSelection((prev) => [...prev, tag.id]);
                      setNewTagInput("");
                      setIsCreatingPhraseTag(false);
                    }
                    if (e.key === "Escape") {
                      setIsCreatingPhraseTag(false);
                      setNewTagInput("");
                    }
                  }}
                  placeholder="Tag name"
                  autoFocus
                  className="px-3 py-1.5 rounded-full text-xs border-2 border-brand-blue/50 focus:border-brand-blue focus:outline-none w-24"
                />
                <button
                  onClick={() => {
                    if (newTagInput.trim()) {
                      const tag = createTag(newTagInput.trim(), "phrase");
                      setPhraseTagSelection((prev) => [...prev, tag.id]);
                      setNewTagInput("");
                      setIsCreatingPhraseTag(false);
                    }
                  }}
                  className="p-1.5 rounded-full bg-brand-blue text-white"
                >
                  <Check size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsCreatingPhraseTag(true)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-border text-faint hover:border-brand-blue/50 hover:text-brand-blue transition-all flex items-center gap-1"
              >
                <Plus size={12} />
                New
              </button>
            )}
          </div>
          <button
            onClick={onSave}
            disabled={!phraseSelectionText.trim() || isSavingPhrase}
            className="w-full py-3.5 bg-brand-blue text-white rounded-2xl font-semibold text-base hover:bg-brand-blue/90 transition-colors disabled:opacity-40 mb-3"
          >
            {isSavingPhrase ? "Processing…" : "Save Phrase"}
          </button>
          <button
            onClick={onCancel}
            disabled={isSavingPhrase}
            className="text-faint font-medium text-sm hover:text-muted-foreground text-center disabled:opacity-40"
          >
            Cancel
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
