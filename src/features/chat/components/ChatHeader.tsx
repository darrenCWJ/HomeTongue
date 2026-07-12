import { Briefcase, ChevronDown, Home, Languages } from "lucide-react";
import type { PersonaType } from "../../../types";

interface ChatHeaderProps {
  activePersona: PersonaType;
  dialect: string;
  hasMessages: boolean;
  onOpenPersonaSheet: () => void;
  onOpenDialectSheet: () => void;
  onNewChat: () => void;
  onOpenSaveDialog: () => void;
}

export function ChatHeader({
  activePersona,
  dialect,
  hasMessages,
  onOpenPersonaSheet,
  onOpenDialectSheet,
  onNewChat,
  onOpenSaveDialog,
}: ChatHeaderProps) {
  return (
    <div className="px-4 py-3 border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between">
      <div>
        <h1 className="font-semibold text-foreground">Live Translation</h1>
        <div className="flex items-center gap-2 mt-0.5">
          <button
            data-tour="chat-persona-selector"
            onClick={onOpenPersonaSheet}
            disabled={hasMessages}
            className={`flex items-center gap-1 text-xs transition-colors ${hasMessages ? "text-faint cursor-not-allowed" : "text-muted-foreground hover:text-brand-blue"}`}
          >
            {activePersona === "work" ? <Briefcase size={11} /> : <Home size={11} />}
            <span className="capitalize">{activePersona}</span>
            <ChevronDown size={10} />
          </button>
          <span className="text-faint text-xs">·</span>
          <button
            data-tour="chat-dialect-selector"
            onClick={onOpenDialectSheet}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-brand-blue transition-colors"
          >
            <Languages size={11} />
            <span>{dialect}</span>
            <ChevronDown size={10} />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {hasMessages && (
          <button
            onClick={onNewChat}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-muted text-muted-foreground rounded-full text-xs font-medium hover:bg-secondary transition-colors"
          >
            New Chat
          </button>
        )}
        <button
          data-tour="chat-save-conversation"
          onClick={onOpenSaveDialog}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue/10 text-brand-blue rounded-full text-xs font-medium hover:bg-brand-blue/15 transition-colors"
        >
          Save Conversation
        </button>
      </div>
    </div>
  );
}
