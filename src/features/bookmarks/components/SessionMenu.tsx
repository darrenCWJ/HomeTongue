import { useEffect } from "react";
import { Pencil, StickyNote, Tag as TagIcon, Trash2 } from "lucide-react";

interface SessionMenuProps {
  menuPosition: { top: number; right: number };
  onClose: () => void;
  onEditName: () => void;
  onEditLabel: () => void;
  onAddNote: () => void;
  onDelete: () => void;
}

export function SessionMenu({
  menuPosition,
  onClose,
  onEditName,
  onEditLabel,
  onAddNote,
  onDelete,
}: SessionMenuProps) {
  // The backdrop below is pointer-only; Escape is the keyboard path out.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 bg-card rounded-xl shadow-lg border border-border py-1.5 w-44"
        style={{ top: menuPosition.top, right: menuPosition.right }}
      >
        <button
          onClick={onEditName}
          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground/90 hover:bg-background transition-colors"
        >
          <Pencil size={14} className="text-faint" />
          Edit Name
        </button>
        <button
          onClick={onEditLabel}
          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground/90 hover:bg-background transition-colors"
        >
          <TagIcon size={14} className="text-faint" />
          Edit Label
        </button>
        <button
          onClick={onAddNote}
          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground/90 hover:bg-background transition-colors"
        >
          <StickyNote size={14} className="text-faint" />
          Add Note
        </button>
        <div className="my-1 border-t border-border-subtle" />
        <button
          onClick={onDelete}
          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
        >
          <Trash2 size={14} className="text-red-400" />
          Delete
        </button>
      </div>
    </>
  );
}
