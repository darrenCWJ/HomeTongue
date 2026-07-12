import { Sparkles, Brain } from "lucide-react";
import type { PersonaType } from "../../../types";

interface VibeAnalysisCardProps {
  activePersona: PersonaType;
  personaSummary: string | undefined;
  characteristicPhrases: string[] | undefined;
}

/** AI personality summary card for the active persona, with phrase chips. */
export function VibeAnalysisCard({
  activePersona,
  personaSummary,
  characteristicPhrases,
}: VibeAnalysisCardProps) {
  return (
    <section>
      <div className="bg-card rounded-3xl shadow-sm border border-brand-blue/15 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-brand-blue/10 to-brand-red/10 rounded-full -mr-10 -mt-10 blur-xl"></div>
        <div className="p-5 relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={18} className="text-brand-blue" />
            <h2 className="font-bold text-foreground">AI Vibe Analysis</h2>
          </div>
          <p className="text-xs text-faint mb-3">
            {activePersona === "personal" ? "Personal persona" : "Work persona"}
          </p>

          {personaSummary ? (
            <>
              <p className="text-sm text-muted-foreground leading-relaxed">{personaSummary}</p>
              {(characteristicPhrases?.length ?? 0) > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-faint uppercase tracking-wider mb-2">
                    Your Phrases
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {characteristicPhrases!.map((phrase, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 bg-brand-blue/10 text-brand-blue rounded-full text-xs font-medium border border-brand-blue/15"
                      >
                        "{phrase}"
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-6">
              <Brain size={32} className="text-faint mx-auto mb-3" />
              <p className="text-sm text-faint leading-relaxed">
                Your {activePersona} persona will appear here after your first conversation.
                <br />
                It gets smarter after every chat.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
