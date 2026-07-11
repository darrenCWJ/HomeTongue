import { createContext, useContext, useState, useEffect, useRef, useMemo, ReactNode } from "react";
import { authGateway, type AuthUser, type SignUpResult } from "../../lib/authGateway";

interface AuthContextType {
  /** The signed-in Supabase user, or null (always null when cloud auth is disabled). */
  authUser: AuthUser | null;
  /** True while the initial session restore is in flight (always false when disabled). */
  authLoading: boolean;
  /**
   * Increments whenever the signed-in user actually changes (sign-in, sign-out,
   * user switch). Constant 0 when cloud auth is disabled — providers use it to
   * re-run their initial-load effects in cloud storage mode only.
   */
  authEpoch: number;
  isCloudAuthEnabled: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// If the session restore never settles (dead network, captive portal), stop
// blocking the UI and fall through to the sign-in gate instead of a blank screen.
const SESSION_RESTORE_TIMEOUT_MS = 8_000;

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(authGateway.isEnabled);
  const [authEpoch, setAuthEpoch] = useState(0);
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authGateway.isEnabled) return;

    let cancelled = false;
    const applyUser = (user: AuthUser | null) => {
      if (cancelled) return;
      setAuthUser(user);
      setAuthLoading(false);
      const userId = user?.id ?? null;
      if (userId !== lastUserIdRef.current) {
        lastUserIdRef.current = userId;
        setAuthEpoch((epoch) => epoch + 1);
      }
    };

    const unsubscribe = authGateway.onAuthUserChange(applyUser);
    const restoreTimeout = setTimeout(() => {
      if (!cancelled) setAuthLoading(false);
    }, SESSION_RESTORE_TIMEOUT_MS);
    authGateway
      .getSessionUser()
      .then(applyUser)
      .catch((err) => {
        console.error("Failed to restore auth session:", err);
        if (!cancelled) setAuthLoading(false);
      })
      .finally(() => clearTimeout(restoreTimeout));

    return () => {
      cancelled = true;
      clearTimeout(restoreTimeout);
      unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      authUser,
      authLoading,
      authEpoch,
      isCloudAuthEnabled: authGateway.isEnabled,
      signInWithPassword: authGateway.signInWithPassword,
      signUpWithPassword: authGateway.signUpWithPassword,
      signOut: authGateway.signOut,
    }),
    [authUser, authLoading, authEpoch]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
