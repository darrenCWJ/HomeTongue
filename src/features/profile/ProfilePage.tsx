import { useAuth } from "../../app/context/AuthProvider";
import { useProfile } from "../../app/context/ProfileProvider";
import { type PersonaType } from "../../types";
import { useActiveLanguagePack } from "../../hooks/useActiveLanguageCode";
import { ProfileHeader } from "./components/ProfileHeader";
import { PersonaSwitcher } from "./components/PersonaSwitcher";
import { VibeAnalysisCard } from "./components/VibeAnalysisCard";
import { SuggestedRepliesToggle } from "./components/SuggestedRepliesToggle";
import { AppearanceSection } from "./components/AppearanceSection";
import { VoiceSection } from "./components/VoiceSection";
import { TourReplaySection } from "./components/TourReplaySection";
import { CloudAccountSection } from "./components/CloudAccountSection";
import { DataPrivacySection } from "./components/DataPrivacySection";

export function ProfilePage() {
  const { isCloudAuthEnabled, authUser, signOut } = useAuth();
  const { setIsSignedIn, userProfile, updateUserProfile, activePersona } = useProfile();
  // Reactive pack resolution (not the module-level accessor): voice-less
  // packs have no display voices and the whole Voice section is hidden.
  const displayVoices = useActiveLanguagePack().tts.displayVoices;

  const activePersonaProfile = userProfile?.personaProfiles?.[activePersona];
  const personaSummary =
    activePersonaProfile?.personaSummary ??
    (activePersona === "personal" ? userProfile?.personaSummary : undefined);
  const characteristicPhrases =
    activePersonaProfile?.characteristicPhrases ??
    (activePersona === "personal" ? userProfile?.characteristicPhrases : undefined);

  const handleSelectPersona = (p: PersonaType) => {
    updateUserProfile({ activePersona: p });
  };

  return (
    <div className="flex flex-col h-full bg-background pb-20 overflow-y-auto scrollbar-none">
      {/* Header Profile Area */}
      <ProfileHeader
        userProfile={userProfile}
        updateUserProfile={updateUserProfile}
        personaSummary={personaSummary}
      />

      <div className="p-4 space-y-6">
        {/* Persona Switcher */}
        <PersonaSwitcher activePersona={activePersona} onSelectPersona={handleSelectPersona} />

        {/* AI Personality Summary */}
        <VibeAnalysisCard
          activePersona={activePersona}
          personaSummary={personaSummary}
          characteristicPhrases={characteristicPhrases}
        />

        {/* Suggested Replies Toggle */}
        <SuggestedRepliesToggle userProfile={userProfile} updateUserProfile={updateUserProfile} />

        {/* Appearance (theme preference; defaults to light until opted in) */}
        <AppearanceSection />

        {/* Voice Selector — hidden for voice-less packs (no display voices) */}
        {displayVoices.length > 0 && (
          <VoiceSection
            displayVoices={displayVoices}
            userProfile={userProfile}
            updateUserProfile={updateUserProfile}
          />
        )}

        {/* Replay Tour */}
        <TourReplaySection />

        {/* Cloud Account */}
        {isCloudAuthEnabled && authUser && <CloudAccountSection authUser={authUser} signOut={signOut} />}

        {/* Data & privacy (ML data pipeline consent, docs/ML_PIPELINE.md) */}
        {isCloudAuthEnabled && authUser && (
          <DataPrivacySection userProfile={userProfile} updateUserProfile={updateUserProfile} />
        )}

        {/* Sign Out */}
        <div className="pt-4">
          <button
            onClick={() => setIsSignedIn(false)}
            className="w-full bg-card text-red-500 border border-red-100 font-semibold rounded-2xl py-4 shadow-sm hover:bg-red-50 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
