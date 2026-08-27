import React from "react";
import { Briefcase, Check, ChevronDown, Home, Pencil, Plus, X } from "lucide-react";
import type { PersonaType, Tag, TagType } from "../../../types";
import { commitTagDraft } from "../tagDraft";

interface SessionTagFilterBarProps {
  sessionTags: Tag[];
  pendingTagDeletions: Set<string>;
  sessionTagFilters: Set<string>;
  setSessionTagFilters: React.Dispatch<React.SetStateAction<Set<string>>>;
  sessionPersonaFilters: Set<PersonaType>;
  setSessionPersonaFilters: React.Dispatch<React.SetStateAction<Set<PersonaType>>>;
  isEditingTags: boolean;
  setIsEditingTags: (value: boolean) => void;
  isCreatingTag: boolean;
  setIsCreatingTag: (value: boolean) => void;
  newTagName: string;
  setNewTagName: (value: string) => void;
  tagsExpanded: boolean;
  setTagsExpanded: (value: boolean) => void;
  createTag: (name: string, type: TagType) => Tag;
  cancelPendingTagDeletion: (tagId: string) => boolean;
  onDeleteTag: (tagId: string) => void;
}

export function SessionTagFilterBar({
  sessionTags,
  pendingTagDeletions,
  sessionTagFilters,
  setSessionTagFilters,
  sessionPersonaFilters,
  setSessionPersonaFilters,
  isEditingTags,
  setIsEditingTags,
  isCreatingTag,
  setIsCreatingTag,
  newTagName,
  setNewTagName,
  tagsExpanded,
  setTagsExpanded,
  createTag,
  cancelPendingTagDeletion,
  onDeleteTag,
}: SessionTagFilterBarProps) {
  const visibleSessionTags = sessionTags.filter((t) => !pendingTagDeletions.has(t.id));
  const hasMoreSessionTags = visibleSessionTags.length > 3;

  const commitDraft = () => {
    if (!newTagName.trim()) return;
    commitTagDraft({
      name: newTagName,
      type: "session",
      tags: sessionTags,
      pendingTagDeletions,
      cancelPendingTagDeletion,
      createTag,
    });
    setNewTagName("");
    setIsCreatingTag(false);
  };
  return (
    <div>
      <div
        className={`flex flex-wrap gap-2 ${!tagsExpanded && hasMoreSessionTags ? "max-h-[2.125rem] overflow-hidden" : ""}`}
      >
        <button
          onClick={() => {
            setSessionPersonaFilters(new Set());
            setSessionTagFilters(new Set());
          }}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            sessionPersonaFilters.size === 0 && sessionTagFilters.size === 0
              ? "bg-brand-blue text-white"
              : "bg-muted text-muted-foreground hover:bg-secondary"
          }`}
        >
          All
        </button>
        {[
          { id: "personal" as PersonaType, label: "Personal", icon: <Home size={11} /> },
          { id: "work" as PersonaType, label: "Work", icon: <Briefcase size={11} /> },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() =>
              setSessionPersonaFilters((prev) => {
                const next = new Set(prev);
                if (next.has(f.id)) next.delete(f.id);
                else next.add(f.id);
                return next;
              })
            }
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              sessionPersonaFilters.has(f.id)
                ? "bg-brand-blue text-white"
                : "bg-muted text-muted-foreground hover:bg-secondary"
            }`}
          >
            {f.icon}
            {f.label}
          </button>
        ))}
        {visibleSessionTags.map((tag) => (
          <div
            key={tag.id}
            className={`flex-shrink-0 rounded-full text-xs font-semibold transition-colors flex items-center ${
              sessionTagFilters.has(tag.id)
                ? "bg-brand-blue text-white"
                : "bg-brand-blue/10 text-brand-blue hover:bg-brand-blue/15"
            }`}
          >
            <button
              onClick={() =>
                !isEditingTags &&
                setSessionTagFilters((prev) => {
                  const next = new Set(prev);
                  if (next.has(tag.id)) next.delete(tag.id);
                  else next.add(tag.id);
                  return next;
                })
              }
              aria-pressed={sessionTagFilters.has(tag.id)}
              className={`py-1.5 pl-3 rounded-full ${isEditingTags ? "pr-1" : "pr-3"}`}
            >
              {tag.name}
            </button>
            {isEditingTags && (
              <button
                onClick={() => onDeleteTag(tag.id)}
                aria-label={`Delete ${tag.name} tag`}
                className="ml-0.5 mr-3 rounded-full hover:bg-brand-blue/20 p-0.5"
              >
                <X size={10} />
              </button>
            )}
          </div>
        ))}
        {isCreatingTag ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitDraft();
                }
                if (e.key === "Escape") {
                  setIsCreatingTag(false);
                  setNewTagName("");
                }
              }}
              placeholder="Tag name"
              aria-label="New tag name"
              autoFocus
              className="px-3 py-1.5 rounded-full text-xs border-2 border-brand-blue/50 focus:border-brand-blue focus:outline-none w-24"
            />
            <button
              onClick={commitDraft}
              aria-label="Create tag"
              className="p-1.5 rounded-full bg-brand-blue text-white"
            >
              <Check size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsCreatingTag(true)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-border text-faint hover:border-brand-blue/50 hover:text-brand-blue transition-all flex items-center gap-1"
          >
            <Plus size={12} />
            New
          </button>
        )}
        <button
          onClick={() => setIsEditingTags(!isEditingTags)}
          aria-label={isEditingTags ? "Done editing tags" : "Edit tags"}
          aria-pressed={isEditingTags}
          className={`flex-shrink-0 p-1.5 rounded-full transition-colors ${
            isEditingTags ? "bg-brand-blue text-white" : "text-faint hover:text-brand-blue hover:bg-muted"
          }`}
        >
          {isEditingTags ? <Check size={12} /> : <Pencil size={12} />}
        </button>
      </div>
      {hasMoreSessionTags && (
        <button
          onClick={() => setTagsExpanded(!tagsExpanded)}
          className="w-full flex items-center justify-center gap-1 text-xs font-medium text-brand-blue hover:text-brand-blue/80 transition-colors mt-2"
        >
          {tagsExpanded ? "Show less labels" : "Show more labels"}
          <ChevronDown
            size={12}
            className={`transition-transform duration-200 ${tagsExpanded ? "rotate-180" : ""}`}
          />
        </button>
      )}
    </div>
  );
}
