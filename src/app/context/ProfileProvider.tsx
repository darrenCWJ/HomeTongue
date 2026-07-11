import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { repositories, isCloudStorageMode } from "../../repositories";
import type { Tone, Message, UserProfile, PersonaType } from "../../types";
import { updatePersona } from "../../services/personaService";
import { newId } from "../../utils/id";
import { resolveLanguagePackByLabel, setActiveLanguage } from "../../languages";
import { useAuth } from "./AuthProvider";

interface ProfileContextType {
  dialect: string;
  setDialect: (d: string) => void;
  activePersona: PersonaType;
  tone: Tone;
  setTone: (t: Tone) => void;
  isSignedIn: boolean;
  setIsSignedIn: (val: boolean) => void;
  userProfile: UserProfile | null;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
  updatePersonaInBackground: (msgs: Message[]) => void;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export const ProfileProvider = ({ children }: { children: ReactNode }) => {
  const { authEpoch } = useAuth();
  const [dialect, setDialect] = useState("Cantonese");
  const [isSignedIn, setIsSignedInState] = useState(() => localStorage.getItem("ht_signed_in") === "true");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const activePersona: PersonaType = userProfile?.activePersona ?? "personal";
  const activePersonaProfile = userProfile?.personaProfiles?.[activePersona];
  const tone: Tone = activePersonaProfile?.tone ?? userProfile?.preferredTone ?? "casual";

  useEffect(() => {
    document.documentElement.style.setProperty("--font-size", "18px");
  }, []);

  // Keep the module-level active language pack in sync with the profile's
  // preferred dialect (Phase 4). With one shipped pack this always resolves
  // to Cantonese, so behavior is unchanged today.
  const preferredDialect = userProfile?.preferredDialect ?? "Cantonese";
  useEffect(() => {
    setActiveLanguage(resolveLanguagePackByLabel(preferredDialect).code);
  }, [preferredDialect]);

  // In cloud storage mode the initial load must re-run when the auth session
  // changes (data is per-user); in local mode this stays a constant 0 so the
  // effect runs exactly once, as before.
  const reloadEpoch = isCloudStorageMode ? authEpoch : 0;

  useEffect(() => {
    void reloadEpoch;
    repositories.user
      .getProfile()
      .then((u) => {
        setUserProfile(u);
      })
      .catch((err) => {
        console.error("Failed to load saved data from local storage:", err);
      });
  }, [reloadEpoch]);

  const setIsSignedIn = useCallback((val: boolean) => {
    localStorage.setItem("ht_signed_in", String(val));
    setIsSignedInState(val);
  }, []);

  const updateUserProfile = useCallback((updates: Partial<UserProfile>) => {
    setUserProfile((prev) => {
      const now = new Date().toISOString();
      const updated: UserProfile = prev
        ? { ...prev, ...updates, updatedAt: now }
        : {
            id: newId(),
            name: "",
            preferredDialect: "Cantonese",
            preferredTone: "casual",
            toneOverrideEnabled: false,
            personalityNotes: "",
            conversationCount: 0,
            createdAt: now,
            updatedAt: now,
            ...updates,
          };
      repositories.user.saveProfile(updated);
      return updated;
    });
  }, []);

  const setTone = useCallback(
    (t: Tone) => {
      updateUserProfile({
        preferredTone: t,
        personaProfiles: {
          ...userProfile?.personaProfiles,
          [activePersona]: { ...activePersonaProfile, tone: t },
        },
      });
    },
    [updateUserProfile, userProfile?.personaProfiles, activePersona, activePersonaProfile]
  );

  const updatePersonaInBackground = useCallback(
    (msgs: Message[]) => {
      const now = new Date().toISOString();
      const effectiveProfile: UserProfile = userProfile ?? {
        id: newId(),
        name: "",
        preferredDialect: "Cantonese",
        preferredTone: "casual",
        toneOverrideEnabled: false,
        personalityNotes: "",
        conversationCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      updatePersona(msgs, effectiveProfile).then((result) => {
        if (result) {
          setUserProfile((prev) => {
            const base = prev ?? effectiveProfile;
            const existingPersonaProfile = base.personaProfiles?.[activePersona];
            const updated: UserProfile = {
              ...base,
              personaProfiles: {
                ...base.personaProfiles,
                [activePersona]: {
                  ...existingPersonaProfile,
                  personaSummary: result.personaSummary,
                  characteristicPhrases: result.characteristicPhrases,
                  tone: existingPersonaProfile?.tone ?? base.preferredTone ?? "casual",
                },
              },
              ...(activePersona === "personal"
                ? {
                    personaSummary: result.personaSummary,
                    characteristicPhrases: result.characteristicPhrases,
                  }
                : {}),
              updatedAt: new Date().toISOString(),
            };
            repositories.user.saveProfile(updated);
            return updated;
          });
        }
      });
    },
    [userProfile, activePersona]
  );

  const value = useMemo(
    () => ({
      dialect,
      setDialect,
      activePersona,
      tone,
      setTone,
      isSignedIn,
      setIsSignedIn,
      userProfile,
      updateUserProfile,
      updatePersonaInBackground,
    }),
    [
      dialect,
      setDialect,
      activePersona,
      tone,
      setTone,
      isSignedIn,
      setIsSignedIn,
      userProfile,
      updateUserProfile,
      updatePersonaInBackground,
    ]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
};

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }
  return context;
};
