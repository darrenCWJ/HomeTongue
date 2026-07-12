import { useState, useRef, useCallback, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import type { Session } from "../../../types";

interface UndoableDeletionsParams {
  deleteTag: (tagId: string) => void;
  deleteSessionMessage: (sessionId: string, msgId: string) => void;
  setSelectedTagFilters: Dispatch<SetStateAction<Set<string>>>;
  setSessionTagFilters: Dispatch<SetStateAction<Set<string>>>;
  setViewingSession: Dispatch<SetStateAction<Session | null>>;
}

/**
 * Undo-window deletions for tags (5s) and session messages (4s): the item is
 * marked pending immediately, actually deleted when the timer fires, and the
 * toast's Undo action cancels the timer and clears the pending mark.
 */
export function useUndoableDeletions({
  deleteTag,
  deleteSessionMessage,
  setSelectedTagFilters,
  setSessionTagFilters,
  setViewingSession,
}: UndoableDeletionsParams) {
  const [pendingTagDeletions, setPendingTagDeletions] = useState<Set<string>>(new Set());
  const [pendingMsgDeletions, setPendingMsgDeletions] = useState<Set<string>>(new Set());
  const deleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const msgDeleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const handleDeleteTag = useCallback(
    (tagId: string) => {
      setPendingTagDeletions((prev) => new Set([...prev, tagId]));
      setSelectedTagFilters((prev) => {
        const next = new Set(prev);
        next.delete(tagId);
        return next;
      });
      setSessionTagFilters((prev) => {
        const next = new Set(prev);
        next.delete(tagId);
        return next;
      });

      const timer = setTimeout(() => {
        deleteTag(tagId);
        setPendingTagDeletions((prev) => {
          const next = new Set(prev);
          next.delete(tagId);
          return next;
        });
        deleteTimers.current.delete(tagId);
      }, 5000);
      deleteTimers.current.set(tagId, timer);

      toast("Tag deleted", {
        duration: 5000,
        action: {
          label: "Undo",
          onClick: () => {
            clearTimeout(deleteTimers.current.get(tagId));
            deleteTimers.current.delete(tagId);
            setPendingTagDeletions((prev) => {
              const next = new Set(prev);
              next.delete(tagId);
              return next;
            });
          },
        },
      });
    },
    [deleteTag, setSelectedTagFilters, setSessionTagFilters]
  );

  const handleDeleteMessage = (sessionId: string, msgId: string) => {
    setPendingMsgDeletions((prev) => new Set([...prev, msgId]));
    const timer = setTimeout(() => {
      deleteSessionMessage(sessionId, msgId);
      setViewingSession((prev) =>
        prev ? { ...prev, messages: prev.messages.filter((m) => m.id !== msgId) } : null
      );
      setPendingMsgDeletions((prev) => {
        const next = new Set(prev);
        next.delete(msgId);
        return next;
      });
      msgDeleteTimers.current.delete(msgId);
    }, 4000);
    msgDeleteTimers.current.set(msgId, timer);
    toast("Message deleted", {
      duration: 4000,
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(msgDeleteTimers.current.get(msgId));
          msgDeleteTimers.current.delete(msgId);
          setPendingMsgDeletions((prev) => {
            const next = new Set(prev);
            next.delete(msgId);
            return next;
          });
        },
      },
    });
  };

  return { pendingTagDeletions, pendingMsgDeletions, handleDeleteTag, handleDeleteMessage };
}
