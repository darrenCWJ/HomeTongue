import { ChevronDown, History, Home, MoreHorizontal } from "lucide-react";
import type { PersonaType, Session } from "../../../types";
import { SessionCard, type SessionCardProps } from "./SessionCard";

interface SessionsTabProps extends Omit<SessionCardProps, "session" | "isFirst"> {
  sessions: Session[];
  sessionPersonaFilters: Set<PersonaType>;
  sessionTagFilters: Set<string>;
  searchLower: string;
  isTourMode: boolean;
}

export function SessionsTab({
  sessions,
  sessionPersonaFilters,
  sessionTagFilters,
  searchLower,
  isTourMode,
  ...cardProps
}: SessionsTabProps) {
  let filteredSessions = sessions
    .filter(
      (s) =>
        sessionPersonaFilters.size === 0 ||
        sessionPersonaFilters.has((s.persona ?? "personal") as PersonaType)
    )
    .filter((s) => sessionTagFilters.size === 0 || s.tags?.some((t) => sessionTagFilters.has(t)))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  if (searchLower) {
    filteredSessions = filteredSessions.filter((s) =>
      s.messages.some(
        (m) =>
          (m.englishTranslation ?? "").toLowerCase().includes(searchLower) ||
          (m.sender === "user" && (m.text ?? "").toLowerCase().includes(searchLower))
      )
    );
  }
  return filteredSessions.length === 0 && !isTourMode ? (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mb-4">
        <History size={24} className="text-zinc-400" />
      </div>
      <h3 className="text-lg font-medium text-zinc-800 mb-1">No saved sessions</h3>
      <p className="text-sm text-zinc-500">
        Finish and save your roleplay conversations to review them later.
      </p>
    </div>
  ) : filteredSessions.length === 0 && isTourMode ? (
    <div
      data-tour="bookmarks-session-card"
      className="relative bg-white rounded-2xl shadow-sm border border-zinc-100"
    >
      <button className="absolute top-2 right-2 p-1.5 rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors">
        <MoreHorizontal size={16} />
      </button>
      <div className="p-5 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-zinc-800 text-base truncate">Morning Greeting</p>
          </div>
          <p className="text-xs text-zinc-400 flex items-center gap-1.5">
            2025-05-08
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-brand-blue/10 text-brand-blue rounded-full text-[10px] font-semibold">
              <Home size={9} /> Personal
            </span>
          </p>
          <p className="text-xs text-zinc-400 truncate mt-0.5 italic">你好，好高興認識你！</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button className="flex items-center gap-1.5 bg-brand-blue/10 rounded-full px-2.5 py-1.5 text-brand-blue flex-shrink-0">
            <ChevronDown size={14} className="rotate-[-90deg]" />
            <span className="text-xs font-medium">View</span>
          </button>
        </div>
      </div>
      {/* Expanded preview */}
      <div className="border-t border-zinc-100 p-3 space-y-2 bg-zinc-50">
        <div className="flex items-end gap-2 justify-start">
          <div className="w-6 h-6 rounded-full bg-brand-red/15 flex items-center justify-center text-[9px] font-bold text-brand-red flex-shrink-0 mb-1">
            粵
          </div>
          <div className="max-w-[75%] rounded-2xl rounded-bl-sm bg-white border border-zinc-200 px-3 py-2">
            <p className="text-sm font-semibold leading-snug text-zinc-800">你好，好高興認識你！</p>
            <p className="text-xs mt-0.5 text-brand-blue">Hello, nice to meet you!</p>
          </div>
        </div>
        <div className="flex items-end gap-2 justify-end">
          <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-brand-blue/100 text-white px-3 py-2">
            <p className="text-sm font-semibold leading-snug text-white">Nice to meet you too!</p>
            <p className="text-xs mt-0.5 text-white/70">我都好高興認識你！</p>
          </div>
          <div className="w-6 h-6 rounded-full bg-brand-blue/15 flex items-center justify-center text-[9px] font-bold text-brand-blue flex-shrink-0 mb-1">
            EN
          </div>
        </div>
      </div>
    </div>
  ) : (
    <>
      {filteredSessions.map((session, sessionIdx) => (
        <SessionCard key={session.id} session={session} isFirst={sessionIdx === 0} {...cardProps} />
      ))}
    </>
  );
}
