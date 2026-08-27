import React from "react";
import { BookOpen, Briefcase, Check, ChevronDown, Home, Mic, MoreHorizontal, X } from "lucide-react";
import type { ConversationLesson, Session, Tag } from "../../../types";
import { activationKeyHandler } from "../../../utils/a11y";

export interface SessionCardProps {
  session: Session;
  isFirst: boolean;
  sessionTags: Tag[];
  pendingTagDeletions: Set<string>;
  conversationLessons: ConversationLesson[];
  expandedSessionId: string | null;
  setExpandedSessionId: (id: string | null) => void;
  editingSessionId: string | null;
  setEditingSessionId: (id: string | null) => void;
  editingTitle: string;
  setEditingTitle: (value: string) => void;
  titleInputRef: React.RefObject<HTMLInputElement>;
  commitTitle: (id: string) => void;
  openMenuSessionId: string | null;
  setOpenMenuSessionId: (id: string | null) => void;
  setMenuPosition: (pos: { top: number; right: number } | null) => void;
  onView: (session: Session) => void;
  editingTagsSessionId: string | null;
  setSessionTags: (sessionId: string, tagIds: string[]) => void;
  pendingConvertSession: Session | null;
  setPendingConvertSession: (session: Session | null) => void;
  audioSourceType: "recorded" | "transcribed";
  setAudioSourceType: (value: "recorded" | "transcribed") => void;
  onMakeLesson: (session: Session) => void;
  onConvertToLesson: (session: Session, audioSource: "recorded" | "transcribed") => void;
}

export function SessionCard({
  session,
  isFirst,
  sessionTags,
  pendingTagDeletions,
  conversationLessons,
  expandedSessionId,
  setExpandedSessionId,
  editingSessionId,
  setEditingSessionId,
  editingTitle,
  setEditingTitle,
  titleInputRef,
  commitTitle,
  openMenuSessionId,
  setOpenMenuSessionId,
  setMenuPosition,
  onView,
  editingTagsSessionId,
  setSessionTags,
  pendingConvertSession,
  setPendingConvertSession,
  audioSourceType,
  setAudioSourceType,
  onMakeLesson,
  onConvertToLesson,
}: SessionCardProps) {
  // Tags inside their 5s undo window are hidden here exactly as in the filter
  // bar, so a doomed tag cannot be assigned to a session (BM-04). The same
  // filtered list backs the attached-tag badges below, so a doomed tag shows
  // neither as a badge nor as an editor chip (folded item A, Task 10).
  const assignableTags = sessionTags.filter((t) => !pendingTagDeletions.has(t.id));
  return (
    <div
      {...(isFirst ? { "data-tour": "bookmarks-session-card" } : {})}
      className="relative bg-card rounded-2xl shadow-sm border border-border-subtle"
    >
      {/* Session header */}
      <div className="p-5 flex items-center gap-3">
        <div
          role="button"
          tabIndex={0}
          aria-expanded={expandedSessionId === session.id}
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => setExpandedSessionId(expandedSessionId === session.id ? null : session.id)}
          onKeyDown={activationKeyHandler(() =>
            setExpandedSessionId(expandedSessionId === session.id ? null : session.id)
          )}
        >
          <div className="flex items-center gap-2 flex-wrap">
            {editingSessionId === session.id ? (
              <input
                ref={titleInputRef}
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTitle(session.id);
                  if (e.key === "Escape") setEditingSessionId(null);
                }}
                onClick={(e) => e.stopPropagation()}
                maxLength={20}
                className="text-base font-semibold text-foreground border-b-2 border-brand-blue outline-none bg-transparent w-36"
              />
            ) : (
              <p className="font-semibold text-foreground text-base truncate">
                {session.title ?? "Conversation"}
              </p>
            )}
          </div>
          <p className="text-xs text-faint flex items-center gap-1.5">
            {session.date}
            {session.persona === "work" ? (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded-full text-[10px] font-semibold">
                <Briefcase size={9} /> Work
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-brand-blue/10 text-brand-blue rounded-full text-[10px] font-semibold">
                <Home size={9} /> Personal
              </span>
            )}
          </p>
          {session.tags && session.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {session.tags.map((tagId) => {
                const tag = assignableTags.find((t) => t.id === tagId);
                if (!tag) return null;
                return (
                  <span
                    key={tagId}
                    className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-blue/10 text-brand-blue"
                  >
                    {tag.name}
                  </span>
                );
              })}
            </div>
          )}
          {session.messages[0]?.text && (
            <p className="text-xs text-faint truncate mt-0.5 italic">{session.messages[0].text}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {editingSessionId === session.id ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => commitTitle(session.id)}
                className="p-2.5 rounded-lg bg-brand-blue/10 text-brand-blue hover:bg-brand-blue/15 transition-colors"
              >
                <Check size={14} />
              </button>
              <button
                onClick={() => setEditingSessionId(null)}
                className="p-2.5 rounded-lg bg-muted text-muted-foreground hover:bg-secondary transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => {
                if (openMenuSessionId === session.id) {
                  setOpenMenuSessionId(null);
                  setMenuPosition(null);
                } else {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setMenuPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                  setOpenMenuSessionId(session.id);
                }
              }}
              className="absolute top-2 right-2 p-1.5 rounded-full text-faint hover:text-muted-foreground hover:bg-muted transition-colors"
            >
              <MoreHorizontal size={16} />
            </button>
          )}
          <button
            onClick={() => onView(session)}
            className="flex items-center gap-1.5 bg-brand-blue/10 rounded-full px-2.5 py-1.5 text-brand-blue flex-shrink-0"
          >
            <ChevronDown size={14} className="rotate-[-90deg]" />
            <span className="text-xs font-medium">View</span>
          </button>
        </div>
      </div>

      {/* Inline tag editor for session */}
      {editingTagsSessionId === session.id && (
        <div className="px-5 pb-4 pt-2 border-t border-border-subtle">
          <p className="text-[10px] font-semibold text-faint uppercase tracking-wide mb-2">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {assignableTags.map((tag) => {
              const isSelected = session.tags?.includes(tag.id) ?? false;
              return (
                <button
                  key={tag.id}
                  onClick={() => {
                    const current = session.tags ?? [];
                    const updated = isSelected ? current.filter((t) => t !== tag.id) : [...current, tag.id];
                    setSessionTags(session.id, updated);
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

      {/* Convert to lesson strip */}
      {conversationLessons.some((l) => l.sessionId === session.id) ? (
        <div className="w-full flex items-center justify-center gap-2 py-2.5 border-t border-brand-blue/15 bg-brand-blue/10/50 text-brand-blue/60 text-xs font-medium">
          <BookOpen size={13} /> Already a lesson
        </div>
      ) : pendingConvertSession?.id === session.id ? (
        <div className="border-t border-brand-blue/15 bg-brand-blue/10/30 p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Choose voice for lesson
          </p>
          <div className="flex gap-2">
            {(["recorded", "transcribed"] as const).map((src) => (
              <button
                key={src}
                onClick={() => setAudioSourceType(src)}
                className={`flex-1 flex items-center gap-2.5 px-3 py-3 rounded-2xl border-2 transition-all ${
                  audioSourceType === src
                    ? "border-brand-blue bg-card"
                    : "border-border bg-card hover:border-brand-blue/20"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${audioSourceType === src ? "bg-brand-blue/100" : "bg-muted"}`}
                >
                  <Mic size={15} className={audioSourceType === src ? "text-white" : "text-faint"} />
                </div>
                <div className="text-left">
                  <p
                    className={`text-xs font-semibold leading-tight ${audioSourceType === src ? "text-brand-blue" : "text-foreground/90"}`}
                  >
                    {src === "recorded" ? "Recorded" : "Synthesised"}
                  </p>
                  <p className="text-[10px] text-faint leading-tight mt-0.5">
                    {src === "recorded" ? "Actual dialect audio" : "Text-to-speech"}
                  </p>
                </div>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPendingConvertSession(null)}
              className="flex-1 py-2.5 rounded-xl border border-border text-muted-foreground text-sm font-medium hover:bg-background transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onConvertToLesson(session, audioSourceType)}
              className="flex-1 py-2.5 rounded-xl bg-brand-blue text-white text-sm font-semibold hover:bg-brand-blue/90 transition-colors"
            >
              Convert
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => onMakeLesson(session)}
          className="w-full flex items-center justify-center gap-2 py-3 border-t border-brand-blue/15 bg-brand-blue/10 text-brand-blue text-sm font-semibold hover:bg-brand-blue/15 transition-colors active:scale-[0.99]"
        >
          <BookOpen size={15} />
          Convert to Lesson
        </button>
      )}

      {/* Inline preview (first few messages) */}
      {expandedSessionId === session.id && (
        <div className="border-t border-border-subtle p-3 space-y-2 bg-background max-h-48 overflow-y-auto">
          {session.messages
            .filter((m) => m.sender !== "bot" || !!m.englishTranslation || !!m.dialectText)
            .slice(0, 4)
            .map((msg, i) => {
              const isBot = msg.sender === "bot";
              const displayText = isBot ? msg.text : (msg.dialectText ?? msg.text);
              const subText = isBot ? msg.englishTranslation : msg.text;
              return (
                <div key={i} className={`flex items-end gap-2 ${isBot ? "justify-start" : "justify-end"}`}>
                  {isBot && (
                    <div className="w-6 h-6 rounded-full bg-brand-red/15 flex items-center justify-center text-[9px] font-bold text-brand-red flex-shrink-0 mb-1">
                      粵
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 ${isBot ? "rounded-bl-sm bg-card border border-border" : "rounded-br-sm bg-brand-blue/100 text-white"}`}
                  >
                    <p
                      className={`text-sm font-semibold leading-snug ${isBot ? "text-foreground" : "text-white"}`}
                    >
                      {displayText}
                    </p>
                    {subText && (
                      <p className={`text-xs mt-0.5 ${isBot ? "text-brand-blue" : "text-white/70"}`}>
                        {subText}
                      </p>
                    )}
                  </div>
                  {!isBot && (
                    <div className="w-6 h-6 rounded-full bg-brand-blue/15 flex items-center justify-center text-[9px] font-bold text-brand-blue flex-shrink-0 mb-1">
                      EN
                    </div>
                  )}
                </div>
              );
            })}
          {session.messages.filter((m) => m.sender !== "bot" || !!m.englishTranslation || !!m.dialectText)
            .length > 4 && (
            <p className="text-center text-xs text-faint pt-1">Tap View to see full conversation</p>
          )}
        </div>
      )}
    </div>
  );
}
