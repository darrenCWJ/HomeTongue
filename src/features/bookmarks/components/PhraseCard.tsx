import { Bookmark, Tag as TagIcon, Volume2 } from "lucide-react";
import type { Phrase, Tag } from "../../../types";

interface PhraseCardProps {
  phrase: Phrase;
  isFirst: boolean;
  phraseTags: Tag[];
  pendingTagDeletions: Set<string>;
  editingTagsPhraseId: string | null;
  setEditingTagsPhraseId: (id: string | null) => void;
  playingId: string | null;
  onSpeak: (phraseId: string, text: string, audioDataUrl?: string, audioDataUrls?: string[]) => void;
  updatePhrase: (phrase: Phrase) => void;
  setPhraseTags: (phraseId: string, tagIds: string[]) => void;
  /** useActiveCapabilities().tts — gates the speaker button (BM-02). */
  ttsEnabled: boolean;
}

export function PhraseCard({
  phrase,
  isFirst,
  phraseTags,
  pendingTagDeletions,
  editingTagsPhraseId,
  setEditingTagsPhraseId,
  playingId,
  onSpeak,
  updatePhrase,
  setPhraseTags,
  ttsEnabled,
}: PhraseCardProps) {
  // Tags inside their 5s undo window are hidden here exactly as in the filter
  // bar, so a doomed tag cannot be assigned to a phrase (BM-04). The same
  // filtered list backs the attached-tag badges below, so a doomed tag shows
  // neither as a badge nor as an editor chip (folded item A, Task 10).
  const assignableTags = phraseTags.filter((t) => !pendingTagDeletions.has(t.id));
  const hasStoredAudio = !!phrase.audioDataUrl || (phrase.audioDataUrls?.length ?? 0) > 0;
  return (
    <div
      {...(isFirst ? { "data-tour": "bookmarks-phrase-card" } : {})}
      className="bg-card rounded-2xl p-4 shadow-sm border border-border-subtle relative"
    >
      <div className="absolute top-4 right-4 flex items-center gap-1">
        <button
          onClick={() => setEditingTagsPhraseId(editingTagsPhraseId === phrase.id ? null : phrase.id)}
          className={`p-1.5 rounded-full transition-colors ${
            editingTagsPhraseId === phrase.id
              ? "bg-brand-blue/15 text-brand-blue"
              : "text-faint hover:text-brand-blue hover:bg-muted"
          }`}
        >
          <TagIcon size={16} />
        </button>
        <button
          onClick={() => updatePhrase({ ...phrase, isBookmarked: false, tags: [] })}
          className="text-brand-blue hover:text-brand-blue/70"
        >
          <Bookmark size={20} className="fill-brand-blue" />
        </button>
      </div>

      <div className="pr-16">
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {phrase.context && (
            <span className="text-[10px] font-medium text-brand-blue uppercase tracking-wider bg-brand-blue/10 px-2 py-0.5 rounded-full">
              {phrase.context}
            </span>
          )}
          {phrase.tags?.map((tagId) => {
            const tag = assignableTags.find((t) => t.id === tagId);
            if (!tag) return null;
            return (
              <span
                key={tagId}
                className="text-[10px] font-semibold text-brand-blue bg-brand-blue/10 px-2 py-0.5 rounded-full"
              >
                {tag.name}
              </span>
            );
          })}
        </div>
        <p className="text-lg font-medium text-foreground mb-1">{phrase.dialect}</p>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-sm text-muted-foreground italic">{phrase.pronunciation}</p>
          {/* Voice-less packs (capabilities.tts false): onSpeak would silently
              no-op for a phrase with no stored clip, which reads as a broken
              button — hide it instead (BM-02). Stored audio always plays. */}
          {(hasStoredAudio || ttsEnabled) && (
            <button
              onClick={() => onSpeak(phrase.id, phrase.dialect, phrase.audioDataUrl, phrase.audioDataUrls)}
              disabled={playingId !== null}
              aria-label="Play pronunciation"
              className={`p-1.5 rounded-full transition-colors ${
                playingId === phrase.id
                  ? "bg-brand-blue/15 text-brand-blue"
                  : "bg-background text-faint hover:bg-muted hover:text-muted-foreground"
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              <Volume2 size={14} className={playingId === phrase.id ? "animate-pulse" : ""} />
            </button>
          )}
        </div>
        <div className="bg-background rounded-lg p-2.5 border border-border-subtle">
          <p className="text-xs text-muted-foreground font-medium line-clamp-2">
            <span className="text-faint font-normal mr-1">Meaning:</span>
            {phrase.original}
          </p>
        </div>
      </div>

      {/* Inline tag editor */}
      {editingTagsPhraseId === phrase.id && (
        <div className="mt-3 pt-3 border-t border-border-subtle">
          <p className="text-[10px] font-semibold text-faint uppercase tracking-wide mb-2">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {assignableTags.map((tag) => {
              const isSelected = phrase.tags?.includes(tag.id) ?? false;
              return (
                <button
                  key={tag.id}
                  onClick={() => {
                    const current = phrase.tags ?? [];
                    const updated = isSelected ? current.filter((t) => t !== tag.id) : [...current, tag.id];
                    setPhraseTags(phrase.id, updated);
                  }}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    isSelected
                      ? "bg-brand-blue text-white"
                      : "bg-muted text-muted-foreground hover:bg-brand-blue/10 hover:text-brand-blue"
                  }`}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
