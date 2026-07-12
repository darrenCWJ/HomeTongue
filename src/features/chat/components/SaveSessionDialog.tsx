import React from "react";
import { Check, Plus } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { Tag, TagType } from "../../../types";

interface SaveSessionDialogProps {
  isOpen: boolean;
  saveTitle: string;
  setSaveTitle: (value: string) => void;
  isSaving: boolean;
  sessionTags: Tag[];
  saveSessionTags: string[];
  setSaveSessionTags: React.Dispatch<React.SetStateAction<string[]>>;
  isCreatingSessionTag: boolean;
  setIsCreatingSessionTag: (value: boolean) => void;
  newSessionTagInput: string;
  setNewSessionTagInput: (value: string) => void;
  createTag: (name: string, type: TagType) => Tag;
  onConfirm: () => void;
  onClose: () => void;
}

export function SaveSessionDialog({
  isOpen,
  saveTitle,
  setSaveTitle,
  isSaving,
  sessionTags,
  saveSessionTags,
  setSaveSessionTags,
  isCreatingSessionTag,
  setIsCreatingSessionTag,
  newSessionTagInput,
  setNewSessionTagInput,
  createTag,
  onConfirm,
  onClose,
}: SaveSessionDialogProps) {
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
          <div className="text-center mb-6">
            <h3 className="text-2xl font-bold text-foreground mb-1">Save Conversation</h3>
            <p className="text-sm text-muted-foreground">Give it a title so you can find it later</p>
          </div>

          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Title</label>
          <input
            type="text"
            value={saveTitle}
            onChange={(e) => setSaveTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirm();
            }}
            placeholder="e.g. Ordering at a restaurant"
            autoFocus
            className="w-full px-4 py-3 border-2 border-brand-blue/20 rounded-xl focus:border-brand-blue focus:outline-none text-foreground mb-4"
          />

          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Tags</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {sessionTags.map((tag) => {
              const isSelected = saveSessionTags.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() =>
                    setSaveSessionTags((prev) =>
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
            {isCreatingSessionTag ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newSessionTagInput}
                  onChange={(e) => setNewSessionTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newSessionTagInput.trim()) {
                      const tag = createTag(newSessionTagInput.trim(), "session");
                      setSaveSessionTags((prev) => [...prev, tag.id]);
                      setNewSessionTagInput("");
                      setIsCreatingSessionTag(false);
                    }
                    if (e.key === "Escape") {
                      setIsCreatingSessionTag(false);
                      setNewSessionTagInput("");
                    }
                  }}
                  placeholder="Tag name"
                  autoFocus
                  className="px-3 py-1.5 rounded-full text-xs border-2 border-brand-blue/50 focus:border-brand-blue focus:outline-none w-24"
                />
                <button
                  onClick={() => {
                    if (newSessionTagInput.trim()) {
                      const tag = createTag(newSessionTagInput.trim(), "session");
                      setSaveSessionTags((prev) => [...prev, tag.id]);
                      setNewSessionTagInput("");
                      setIsCreatingSessionTag(false);
                    }
                  }}
                  className="p-1.5 rounded-full bg-brand-blue text-white"
                >
                  <Check size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsCreatingSessionTag(true)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-border text-faint hover:border-brand-blue/50 hover:text-brand-blue transition-all flex items-center gap-1"
              >
                <Plus size={12} />
                New
              </button>
            )}
          </div>

          <button
            onClick={onConfirm}
            disabled={!saveTitle.trim() || isSaving}
            className="w-full py-3.5 bg-brand-blue text-white rounded-2xl font-semibold text-base hover:bg-brand-blue/90 transition-colors disabled:opacity-40"
          >
            {isSaving ? "Processing…" : "Save"}
          </button>
          <button
            onClick={onClose}
            className="mt-4 text-faint font-medium text-sm hover:text-muted-foreground text-center"
          >
            Cancel
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
