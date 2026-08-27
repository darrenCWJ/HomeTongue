import { toast } from "sonner";
import type { Tag, TagType } from "../../types";

interface CommitTagDraftParams {
  /** Raw draft text from the tag bar input. */
  name: string;
  type: TagType;
  /** Tags of this type currently in provider state, pending ones included. */
  tags: Tag[];
  pendingTagDeletions: Set<string>;
  cancelPendingTagDeletion: (tagId: string) => boolean;
  createTag: (name: string, type: TagType) => Tag;
}

/**
 * Commit a tag-bar draft name (BM-01).
 *
 * A tag inside its 5s undo window still exists in provider state, and
 * LibraryProvider.createTag dedupes by case-insensitive name + type — so
 * "recreating" a just-deleted tag used to hand back the doomed tag, which
 * then vanished when the delete timer fired. Reviving the pending tag makes
 * the name usable again for real.
 */
export function commitTagDraft({
  name,
  type,
  tags,
  pendingTagDeletions,
  cancelPendingTagDeletion,
  createTag,
}: CommitTagDraftParams): void {
  const trimmed = name.trim();
  if (!trimmed) return;

  const pendingMatch = tags.find(
    (t) => t.type === type && pendingTagDeletions.has(t.id) && t.name.toLowerCase() === trimmed.toLowerCase()
  );
  // A false return means the delete already committed, so fall through and
  // create the tag fresh.
  if (pendingMatch && cancelPendingTagDeletion(pendingMatch.id)) {
    toast.success("Tag restored.");
    return;
  }

  createTag(trimmed, type);
}
