import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

const LANGUAGES = [
  { id: "cantonese", label: "Cantonese", native: "粵", available: true },
  { id: "hokkien",   label: "Hokkien",   native: "閩", available: false },
  { id: "teochew",   label: "Teochew",   native: "潮", available: false },
  { id: "hakka",     label: "Hakka",     native: "客", available: false },
];

export function LanguageFilter() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
        className="flex items-center gap-1.5 bg-white border border-zinc-200 rounded-full px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-brand-blue/50 hover:text-brand-blue transition-colors shadow-sm"
      >
        <span className="text-xs font-bold">粵</span>
        Cantonese
        <ChevronDown size={13} className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-lg border border-zinc-100 overflow-hidden z-50">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.id}
              disabled={!lang.available}
              onClick={() => { if (lang.available) setOpen(false); }}
              className={`w-full flex items-center justify-between px-4 py-3 text-sm transition-colors
                ${lang.available
                  ? "text-zinc-800 hover:bg-brand-blue/10 hover:text-brand-blue"
                  : "text-zinc-300 cursor-not-allowed"
                }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-bold w-5 text-center">{lang.native}</span>
                <div className="text-left">
                  <p className="font-medium leading-tight">{lang.label}</p>
                  {!lang.available && <p className="text-[10px] text-zinc-300 leading-tight">Coming soon</p>}
                </div>
              </div>
              {lang.id === "cantonese" && <Check size={13} className="text-brand-blue flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
