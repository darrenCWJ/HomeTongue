import { SunMoon } from "lucide-react";
import { useTheme } from "../../../hooks/useTheme";

/** Appearance (theme preference; defaults to light until opted in). */
export function AppearanceSection() {
  const { preference: themePreference, setTheme } = useTheme();

  return (
    <section>
      <div className="flex items-center gap-2 mb-3 px-2">
        <SunMoon size={18} className="text-faint" />
        <h2 className="text-sm font-semibold text-foreground/90 uppercase tracking-wider">Appearance</h2>
      </div>
      <div className="flex bg-muted rounded-xl p-1">
        {(["light", "dark", "system"] as const).map((option) => (
          <button
            key={option}
            onClick={() => setTheme(option)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${
              themePreference === option
                ? "bg-card text-brand-blue shadow-sm"
                : "text-muted-foreground hover:text-foreground/90"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </section>
  );
}
