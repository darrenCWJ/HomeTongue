import React from "react";
import { Check, ChevronDown, Pencil, Plus, X } from "lucide-react";
import type { Tag, TagType } from "../../../types";
import { commitTagDraft } from "../tagDraft";

interface PhraseTagFilterBarProps {
  phraseTags: Tag[];
  pendingTagDeletions: Set<string>;
  selectedTagFilters: Set<string>;
  setSelectedTagFilters: React.Dispatch<React.SetStateAction<Set<string>>>;
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

export function PhraseTagFilterBar({
  phraseTags,
  pendingTagDeletions,
  selectedTagFilters,
  setSelectedTagFilters,
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
}: PhraseTagFilterBarProps) {
  const visiblePhraseTags = phraseTags.filter((t) => !pendingTagDeletions.has(t.id));
  const hasMorePhraseTags = visiblePhraseTags.length > 3;

  const commitDraft = () => {
    if (!newTagName.trim()) return;
    commitTagDraft({
      name: newTagName,
      type: "phrase",
      tags: phraseTags,
      pendingTagDeletions,
      cancelPendingTagDeletion,
      createTag,
    });
    setNewTagName("");
    setIsCreatingTag(false);
  };
  return (
    <div data-tour="bookmarks-tag-filter">
      <div
        className={`flex flex-wrap gap-2 ${!tagsExpanded && hasMorePhraseTags ? "max-h-[2.125rem] overflow-hidden" : ""}`}
      >
        <button
          onClick={() => setSelectedTagFilters(new Set())}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            selectedTagFilters.size === 0
              ? "bg-brand-blue text-white"
              : "bg-muted text-muted-foreground hover:bg-secondary"
          }`}
        >
          All
        </button>
        {visiblePhraseTags.map((tag) => (
          <button
            key={tag.id}
            onClick={() =>
              !isEditingTags &&
              setSelectedTagFilters((prev) => {
                const next = new Set(prev);
                if (next.has(tag.id)) next.delete(tag.id);
                else next.add(tag.id);
                return next;
              })
            }
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1 ${
              selectedTagFilters.has(tag.id)
                ? "bg-brand-blue text-white"
                : "bg-brand-blue/10 text-brand-blue hover:bg-brand-blue/15"
            }`}
          >
            {tag.name}
            {isEditingTags && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteTag(tag.id);
                }}
                className="ml-0.5 rounded-full hover:bg-brand-blue/20 p-0.5"
              >
                <X size={10} />
              </span>
            )}
          </button>
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
          className={`flex-shrink-0 p-1.5 rounded-full transition-colors ${
            isEditingTags ? "bg-brand-blue text-white" : "text-faint hover:text-brand-blue hover:bg-muted"
          }`}
        >
          {isEditingTags ? <Check size={12} /> : <Pencil size={12} />}
        </button>
      </div>
      {hasMorePhraseTags && (
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
