import { useState, useRef, useEffect } from "react";
import { ChevronRight, Check, X, MessageCircle, Trash2, Pencil, MoreHorizontal } from "lucide-react";
import type { ConversationLesson } from "../../../types";

// ─── ConversationLessonCard ───────────────────────────────────────────────────

export function ConversationLessonCard({
  lesson,
  onClick,
  onDelete,
  onEditTitle,
}: {
  lesson: ConversationLesson;
  onClick: () => void;
  onDelete: () => void;
  onEditTitle: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(lesson.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const statusLabel = lesson.examCompleted
    ? "Passed"
    : lesson.examAttempts > 0
      ? "In Progress"
      : "Not started";
  const statusColor = lesson.examCompleted
    ? "bg-green-100 text-green-700"
    : lesson.examAttempts > 0
      ? "bg-orange-100 text-orange-700"
      : "bg-zinc-100 text-zinc-500";

  const commitEdit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== lesson.title) {
      onEditTitle(trimmed);
    } else {
      setDraft(lesson.title);
    }
    setEditing(false);
  };

  return (
    <div
      onClick={editing || menuOpen ? undefined : onClick}
      className="relative bg-white rounded-2xl p-4 shadow-sm border border-zinc-100 flex items-center gap-4 active:scale-[0.98] transition-transform cursor-pointer hover:border-brand-blue/15 hover:shadow-md"
    >
      <div className="absolute top-2 right-2" ref={menuRef}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
          aria-label="More options"
        >
          <MoreHorizontal size={16} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-8 z-20 bg-white rounded-xl shadow-lg border border-zinc-100 py-1 min-w-[120px]">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                setEditing(true);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              <Pencil size={14} />
              Edit title
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onDelete();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        )}
      </div>
      <div className="w-12 h-12 rounded-xl bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
        <MessageCircle size={20} className="text-brand-blue" />
      </div>
      <div className="flex-1 min-w-0 pr-6">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") {
                  setDraft(lesson.title);
                  setEditing(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              maxLength={20}
              className="font-semibold text-sm text-zinc-800 flex-1 min-w-0 border-b border-brand-blue/50 outline-none bg-transparent pb-0.5"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                commitEdit();
              }}
              className="p-1 rounded-full bg-brand-blue text-white flex-shrink-0"
            >
              <Check size={12} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDraft(lesson.title);
                setEditing(false);
              }}
              className="p-1 rounded-full bg-zinc-100 text-zinc-500 flex-shrink-0"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <h4 className="font-semibold text-sm text-zinc-800 truncate">{lesson.title}</h4>
        )}
        <p className="text-xs text-zinc-500 mb-1.5">{lesson.vocabulary.length} phrases</p>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor}`}>
            {statusLabel}
          </span>
          {lesson.examBestScore !== undefined && (
            <span className="text-xs text-zinc-400">Best: {lesson.examBestScore}%</span>
          )}
        </div>
      </div>
      <ChevronRight size={20} className="text-zinc-300 flex-shrink-0" />
    </div>
  );
}
