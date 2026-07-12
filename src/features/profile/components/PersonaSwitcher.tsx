import { User, Home, Briefcase } from "lucide-react";
import type { PersonaType } from "../../../types";

interface PersonaSwitcherProps {
  activePersona: PersonaType;
  onSelectPersona: (p: PersonaType) => void;
}

/** Personal/Work persona picker (tour anchor: profile-persona-switcher). */
export function PersonaSwitcher({ activePersona, onSelectPersona }: PersonaSwitcherProps) {
  return (
    <section data-tour="profile-persona-switcher">
      <div className="flex items-center gap-2 mb-3 px-2">
        <User size={18} className="text-faint" />
        <h2 className="text-sm font-semibold text-foreground/90 uppercase tracking-wider">
          Active Persona
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onSelectPersona("personal")}
          className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
            activePersona === "personal"
              ? "bg-brand-blue/10 border-brand-blue shadow-sm"
              : "bg-card border-border-subtle hover:border-border"
          }`}
        >
          <Home size={24} className={activePersona === "personal" ? "text-brand-blue" : "text-faint"} />
          <span
            className={`font-semibold text-sm ${activePersona === "personal" ? "text-brand-blue" : "text-muted-foreground"}`}
          >
            Personal
          </span>
          <span className="text-xs text-faint text-center">Home & family conversations</span>
        </button>
        <button
          onClick={() => onSelectPersona("work")}
          className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
            activePersona === "work"
              ? "bg-brand-blue/10 border-brand-blue shadow-sm"
              : "bg-card border-border-subtle hover:border-border"
          }`}
        >
          <Briefcase size={24} className={activePersona === "work" ? "text-brand-blue" : "text-faint"} />
          <span
            className={`font-semibold text-sm ${activePersona === "work" ? "text-brand-blue" : "text-muted-foreground"}`}
          >
            Work
          </span>
          <span className="text-xs text-faint text-center">Professional context</span>
        </button>
      </div>
    </section>
  );
}
