import { useState, useRef, useCallback, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

const TAG_UNDO_MS = 5000;
const MESSAGE_UNDO_MS = 4000;

interface UndoableDeletionsParams {
  deleteTag: (tagId: string) => void;
  deleteSessionMessage: (sessionId: string, msgId: string) => void;
  selectedTagFilters: Set<string>;
  setSelectedTagFilters: Dispatch<SetStateAction<Set<string>>>;
  sessionTagFilters: Set<string>;
  setSessionTagFilters: Dispatch<SetStateAction<Set<string>>>;
}

function withoutId(ids: Set<string>, id: string): Set<string> {
  const next = new Set(ids);
  next.delete(id);
  return next;
}

/**
 * Undo-window deletions for tags (5s) and session messages (4s): the item is
 * marked pending immediately, actually deleted when the timer fires, and the
 * toast's Undo action cancels the timer and clears the pending mark.
 *
 * A pending tag still exists in provider state, so `cancelPendingTagDeletion`
 * lets the tag-create paths revive it rather than "recreate" it — createTag
 * dedupes by name and would otherwise hand back the doomed tag (BM-01).
 *
 * Message deletions write only to the provider: the viewer derives its
 * messages from live provider state, so patching a snapshot here would
 * resurrect the message on the next remount (BM-05).
 */
export function useUndoableDeletions({
  deleteTag,
  deleteSessionMessage,
  selectedTagFilters,
  setSelectedTagFilters,
  sessionTagFilters,
  setSessionTagFilters,
}: UndoableDeletionsParams) {
  const [pendingTagDeletions, setPendingTagDeletions] = useState<Set<string>>(new Set());
  const [pendingMsgDeletions, setPendingMsgDeletions] = useState<Set<string>>(new Set());
  const deleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const msgDeleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /** Cancel a tag's pending deletion. Returns false if none was pending. */
  const cancelPendingTagDeletion = useCallback((tagId: string): boolean => {
    const timer = deleteTimers.current.get(tagId);
    if (timer === undefined) return false;
    clearTimeout(timer);
    deleteTimers.current.delete(tagId);
    setPendingTagDeletions((prev) => withoutId(prev, tagId));
    return true;
  }, []);

  const handleDeleteTag = useCallback(
    (tagId: string) => {
      // Recorded before the sets are cleared so Undo can restore exactly the
      // filter selections this delete took away (BM-07).
      const wasPhraseFilter = selectedTagFilters.has(tagId);
      const wasSessionFilter = sessionTagFilters.has(tagId);

      setPendingTagDeletions((prev) => new Set([...prev, tagId]));
      if (wasPhraseFilter) setSelectedTagFilters((prev) => withoutId(prev, tagId));
      if (wasSessionFilter) setSessionTagFilters((prev) => withoutId(prev, tagId));

      const timer = setTimeout(() => {
        deleteTag(tagId);
        setPendingTagDeletions((prev) => withoutId(prev, tagId));
        deleteTimers.current.delete(tagId);
      }, TAG_UNDO_MS);
      deleteTimers.current.set(tagId, timer);

      toast("Tag deleted", {
        duration: TAG_UNDO_MS,
        action: {
          label: "Undo",
          onClick: () => {
            // Nothing left to undo — the delete has already committed (or the
            // tag was revived by a recreate). Re-adding the id then would put
            // a filter on a tag that no longer exists, with no chip to clear.
            if (!cancelPendingTagDeletion(tagId)) return;
            if (wasPhraseFilter) setSelectedTagFilters((prev) => new Set(prev).add(tagId));
            if (wasSessionFilter) setSessionTagFilters((prev) => new Set(prev).add(tagId));
          },
        },
      });
    },
    [
      cancelPendingTagDeletion,
      deleteTag,
      selectedTagFilters,
      sessionTagFilters,
      setSelectedTagFilters,
      setSessionTagFilters,
    ]
  );

  const handleDeleteMessage = useCallback(
    (sessionId: string, msgId: string) => {
      setPendingMsgDeletions((prev) => new Set([...prev, msgId]));
      const timer = setTimeout(() => {
        deleteSessionMessage(sessionId, msgId);
        setPendingMsgDeletions((prev) => withoutId(prev, msgId));
        msgDeleteTimers.current.delete(msgId);
      }, MESSAGE_UNDO_MS);
      msgDeleteTimers.current.set(msgId, timer);

      toast("Message deleted", {
        duration: MESSAGE_UNDO_MS,
        action: {
          label: "Undo",
          onClick: () => {
            clearTimeout(msgDeleteTimers.current.get(msgId));
            msgDeleteTimers.current.delete(msgId);
            setPendingMsgDeletions((prev) => withoutId(prev, msgId));
          },
        },
      });
    },
    [deleteSessionMessage]
  );

  return {
    pendingTagDeletions,
    pendingMsgDeletions,
    cancelPendingTagDeletion,
    handleDeleteTag,
    handleDeleteMessage,
  };
}
