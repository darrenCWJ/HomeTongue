import React, { useState } from "react";
import { Volume2, Loader2 } from "lucide-react";
import type { UserProfile } from "../../../types";
import type { DisplayVoice } from "../../../languages/types";
import { asVoiceKey } from "../../../hooks/useGoogleTTS";
import { previewVoice } from "../../../utils/voicePreviewCache";

const PREVIEW_TEXT = "你好，好高興認識你！";

interface VoiceSectionProps {
  displayVoices: ReadonlyArray<DisplayVoice>;
  userProfile: UserProfile | null;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
}

/**
 * Voice selector with gender tabs and per-voice preview playback
 * (tour anchor: profile-voice-selection). Render only when the active pack
 * has display voices — the parent hides this section for voice-less packs.
 */
export function VoiceSection({ displayVoices, userProfile, updateUserProfile }: VoiceSectionProps) {
  const [voiceGenderTab, setVoiceGenderTab] = useState<"female" | "male">("female");
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  // Resolve the stored id the same way playback does. Comparing the RAW value
  // left a profile holding a legacy ElevenLabs id with NO voice ticked, while
  // the app happily spoke in the voice that id maps to.
  const selectedVoiceKey = asVoiceKey(userProfile?.preferredVoiceId);

  const handlePreview = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (previewingId) return;
    setPreviewingId(id);
    try {
      await previewVoice(id, PREVIEW_TEXT);
    } catch {
      // ignore preview errors
    } finally {
      setPreviewingId(null);
    }
  };

  return (
    <section data-tour="profile-voice-selection">
      <div className="flex items-center gap-2 mb-3 px-2">
        <Volume2 size={18} className="text-faint" />
        <h2 className="text-sm font-semibold text-foreground/90 uppercase tracking-wider">Voice</h2>
      </div>

      {/* Voice tabs */}
      <div className="flex bg-muted rounded-xl p-1 mb-3">
        {(["female", "male"] as const).map((g) => (
          <button
            key={g}
            onClick={() => setVoiceGenderTab(g)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${
              voiceGenderTab === g
                ? "bg-card text-brand-blue shadow-sm"
                : "text-muted-foreground hover:text-foreground/90"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="bg-card rounded-2xl shadow-sm border border-border-subtle overflow-hidden divide-y divide-border-subtle">
        {displayVoices
          .filter((v) => v.gender === voiceGenderTab)
          .map((voice) => {
            const selected = selectedVoiceKey === voice.key;
            return (
              <label
                key={voice.key}
                className="flex items-center p-4 cursor-pointer hover:bg-background transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className={`font-medium ${selected ? "text-brand-blue" : "text-foreground"}`}>
                      {voice.label}
                    </h3>
                  </div>
                </div>
                <button
                  onClick={(e) => handlePreview(e, voice.key)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mr-2 transition-colors ${
                    previewingId === voice.key ? "bg-brand-blue/15" : "bg-muted hover:bg-brand-blue/15"
                  }`}
                >
                  {previewingId === voice.key ? (
                    <Loader2 size={14} className="text-brand-blue animate-spin" />
                  ) : (
                    <Volume2 size={14} className="text-muted-foreground" />
                  )}
                </button>
                <div className="relative flex items-center justify-center w-6 h-6 shrink-0">
                  <input
                    type="radio"
                    name="voice"
                    value={voice.key}
                    checked={selected}
                    onChange={() => updateUserProfile({ preferredVoiceId: voice.key })}
                    className="peer appearance-none w-5 h-5 border-2 border-border rounded-full checked:border-brand-blue transition-colors cursor-pointer"
                  />
                  {selected && (
                    <div className="absolute w-2.5 h-2.5 bg-brand-blue rounded-full pointer-events-none" />
                  )}
                </div>
              </label>
            );
          })}
      </div>
    </section>
  );
}
