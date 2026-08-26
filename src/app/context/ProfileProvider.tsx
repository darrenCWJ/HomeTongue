import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import { repositories, isCloudStorageMode } from "../../repositories";
import type { Tone, Message, UserProfile, PersonaType } from "../../types";
import { updatePersona } from "../../services/personaService";
import { newId } from "../../utils/id";
import { resolveLanguagePackByLabel, setActiveLanguage } from "../../languages";
import { useAuth } from "./AuthProvider";

/** Where the stored profile is in its load: "loaded" also covers "none stored". */
export type ProfileStatus = "loading" | "loaded" | "error";

interface ProfileContextType {
  dialect: string;
  setDialect: (d: string) => void;
  activePersona: PersonaType;
  tone: Tone;
  setTone: (t: Tone) => void;
  isSignedIn: boolean;
  setIsSignedIn: (val: boolean) => void;
  userProfile: UserProfile | null;
  /**
   * Distinguishes "no profile stored" from "not loaded yet". Consumers must not
   * treat a missing profile as a new user until this is "loaded".
   */
  profileStatus: ProfileStatus;
  retryProfileLoad: () => void;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
  updatePersonaInBackground: (msgs: Message[]) => void;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

const DEFAULT_DIALECT = "Cantonese";

/**
 * Guards every write that would CREATE a profile out of nothing. Until the load
 * settles, "no profile in memory" may only mean "not loaded yet", and the fresh
 * profile would be upserted over the stored row (saveProfile conflicts on
 * user_id). Returns true when the caller must leave state untouched.
 */
function shouldIgnoreUnhydratedWrite(prev: UserProfile | null, status: ProfileStatus): boolean {
  if (prev !== null || status === "loaded") return false;
  console.warn("[profile] write ignored: profile not hydrated yet");
  return true;
}

export const ProfileProvider = ({ children }: { children: ReactNode }) => {
  const { authEpoch } = useAuth();
  const [isSignedIn, setIsSignedInState] = useState(() => localStorage.getItem("ht_signed_in") === "true");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("loading");
  const [retryCount, setRetryCount] = useState(0);

  // Mirror of `profileStatus` for the write guards below. They read it through
  // a ref, not the state value, so their dep arrays stay empty and the context
  // value keeps a stable identity across every load transition. The load effect
  // is the only writer, and it sets both together so they cannot drift.
  const statusRef = useRef<ProfileStatus>("loading");

  const activePersona: PersonaType = userProfile?.activePersona ?? "personal";
  const activePersonaProfile = userProfile?.personaProfiles?.[activePersona];
  const tone: Tone = activePersonaProfile?.tone ?? userProfile?.preferredTone ?? "casual";

  useEffect(() => {
    document.documentElement.style.setProperty("--font-size", "18px");
  }, []);

  // Single source of truth for the dialect: the persisted profile. The
  // context `dialect` is derived from it, and `setDialect` persists through
  // the profile update path, so a selection in the chat DialectSheet flows
  // into setActiveLanguage below. With one shipped pack this always resolves
  // to Cantonese, so behavior is unchanged today (Phase 4).
  const dialect = userProfile?.preferredDialect ?? DEFAULT_DIALECT;
  useEffect(() => {
    setActiveLanguage(resolveLanguagePackByLabel(dialect).code);
  }, [dialect]);

  // In cloud storage mode the initial load must re-run when the auth session
  // changes (data is per-user); in local mode this stays a constant 0 so the
  // effect runs exactly once, as before.
  const reloadEpoch = isCloudStorageMode ? authEpoch : 0;

  useEffect(() => {
    void reloadEpoch;
    void retryCount;
    // An earlier run's promise may still be in flight (epoch change mid-load,
    // or a retry). Ignore whatever it settles to: a stale "null" landing last
    // would blank a loaded profile and hand the user straight to onboarding.
    let cancelled = false;
    const applyStatus = (next: ProfileStatus) => {
      statusRef.current = next;
      setProfileStatus(next);
    };

    applyStatus("loading");
    repositories.user
      .getProfile()
      .then((u) => {
        if (cancelled) return;
        setUserProfile(u);
        applyStatus("loaded");
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load saved data from local storage:", err);
        applyStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [reloadEpoch, retryCount]);

  const retryProfileLoad = useCallback(() => {
    setRetryCount((count) => count + 1);
  }, []);

  const setIsSignedIn = useCallback((val: boolean) => {
    localStorage.setItem("ht_signed_in", String(val));
    setIsSignedInState(val);
  }, []);

  const updateUserProfile = useCallback((updates: Partial<UserProfile>) => {
    setUserProfile((prev) => {
      if (shouldIgnoreUnhydratedWrite(prev, statusRef.current)) return prev;
      const now = new Date().toISOString();
      const updated: UserProfile = prev
        ? { ...prev, ...updates, updatedAt: now }
        : {
            id: newId(),
            name: "",
            preferredDialect: DEFAULT_DIALECT,
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

  const setDialect = useCallback(
    (d: string) => {
      updateUserProfile({ preferredDialect: d });
    },
    [updateUserProfile]
  );

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
        preferredDialect: DEFAULT_DIALECT,
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
            // By the time the summary lands the load may have settled; if it
            // still has not, drop the summary rather than let a background job
            // be the thing that invents a profile row.
            if (shouldIgnoreUnhydratedWrite(prev, statusRef.current)) return prev;
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
      profileStatus,
      retryProfileLoad,
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
      profileStatus,
      retryProfileLoad,
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
