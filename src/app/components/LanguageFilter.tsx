import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { DIALECTS } from "../../types";
import { useProfile } from "../context/ProfileProvider";
import { resolveLanguagePackByLabel } from "../../languages";

/**
 * Dialect switcher shown on the Learn / Bookmarks headers. Derived from the
 * same DIALECTS registry as the chat DialectSheet, and wired to the profile
 * dialect so both surfaces always agree on the active language.
 */
export function LanguageFilter() {
  const { dialect, setDialect } = useProfile();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activePack = resolveLanguagePackByLabel(dialect);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 bg-card border border-border rounded-full px-3 py-1.5 text-sm font-medium text-foreground/90 hover:border-brand-blue/50 hover:text-brand-blue transition-colors shadow-sm"
      >
        <span className="text-xs font-bold">{activePack.character}</span>
        {activePack.label}
        <ChevronDown size={13} className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-card rounded-2xl shadow-lg border border-border-subtle overflow-hidden z-50">
          {DIALECTS.map((d) => (
            <button
              key={d.value}
              disabled={!d.available}
              onClick={() => {
                if (d.available) {
                  setDialect(d.value);
                  setOpen(false);
                }
              }}
              className={`w-full flex items-center justify-between px-4 py-3 text-sm transition-colors
                ${
                  d.available
                    ? "text-foreground hover:bg-brand-blue/10 hover:text-brand-blue"
                    : "text-faint cursor-not-allowed"
                }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-bold w-5 text-center">{d.character}</span>
                <div className="text-left">
                  <p className="font-medium leading-tight">{d.label}</p>
                  {!d.available && <p className="text-[10px] text-faint leading-tight">Coming soon</p>}
                  {d.available && d.experimental && (
                    <p className="text-[10px] text-amber-600 leading-tight">Experimental — text only</p>
                  )}
                </div>
              </div>
              {d.value === dialect && d.available && (
                <Check size={13} className="text-brand-blue flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
