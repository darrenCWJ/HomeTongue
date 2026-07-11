import { getSupabaseClient } from "./supabase";

// Config-gated auth gateway.
//
// Mirrors the static-gate pattern used by src/repositories/index.ts. The env
// check is intentionally repeated here (instead of importing
// `isSupabaseConfigured`) so Vite's define replacement turns it into a local
// compile-time constant: when the VITE_SUPABASE_* env vars are absent the
// cloud branch — and with it getSupabaseClient and the whole
// @supabase/supabase-js dependency — is reliably dead-code-eliminated from
// the bundle. `!!` (not `Boolean(...)`) is load-bearing: Rollup constant-folds
// logical/unary expressions during tree-shaking but treats a `Boolean()` call
// as opaque. Keep this expression in sync with src/lib/supabase.ts.
const isCloudAuthConfigured: boolean = !!(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
);

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface SignUpResult {
  /** True when Supabase requires the user to confirm their email before a session exists. */
  needsEmailConfirmation: boolean;
}

export interface AuthGateway {
  isEnabled: boolean;
  /** Resolves the currently persisted session's user, or null. */
  getSessionUser(): Promise<AuthUser | null>;
  /** Subscribes to auth state changes. Returns an unsubscribe function. */
  onAuthUserChange(callback: (user: AuthUser | null) => void): () => void;
  signInWithPassword(email: string, password: string): Promise<void>;
  signUpWithPassword(email: string, password: string): Promise<SignUpResult>;
  signOut(): Promise<void>;
}

// Deliberately avoids naming the VITE_SUPABASE_* vars so a local-only build
// stays free of any "supabase" string (see the dist/ grep gate). The setup
// hint lives in .env.example and src/lib/supabase.ts.
const NOT_CONFIGURED_MESSAGE = "Cloud auth is not configured. This build runs in local-only mode.";

export function createDisabledAuthGateway(): AuthGateway {
  const notConfigured = () => Promise.reject(new Error(NOT_CONFIGURED_MESSAGE));
  return {
    isEnabled: false,
    getSessionUser: () => Promise.resolve(null),
    onAuthUserChange: () => () => {},
    signInWithPassword: notConfigured,
    signUpWithPassword: notConfigured,
    signOut: notConfigured,
  };
}

function toAuthUser(user: { id: string; email?: string } | null | undefined): AuthUser | null {
  return user ? { id: user.id, email: user.email ?? null } : null;
}

function createSupabaseAuthGateway(): AuthGateway {
  return {
    isEnabled: true,

    async getSessionUser(): Promise<AuthUser | null> {
      const { data, error } = await getSupabaseClient().auth.getSession();
      if (error) {
        throw new Error(`Could not restore your session: ${error.message}`);
      }
      return toAuthUser(data.session?.user);
    },

    onAuthUserChange(callback: (user: AuthUser | null) => void): () => void {
      const { data } = getSupabaseClient().auth.onAuthStateChange((_event, session) => {
        callback(toAuthUser(session?.user));
      });
      return () => data.subscription.unsubscribe();
    },

    async signInWithPassword(email: string, password: string): Promise<void> {
      const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
      if (error) {
        throw new Error(error.message);
      }
    },

    async signUpWithPassword(email: string, password: string): Promise<SignUpResult> {
      const { data, error } = await getSupabaseClient().auth.signUp({ email, password });
      if (error) {
        throw new Error(error.message);
      }
      // With email confirmation enabled (the Supabase default) no session is
      // returned; with confirmations disabled the user is signed in right away.
      return { needsEmailConfirmation: !data.session };
    },

    async signOut(): Promise<void> {
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) {
        throw new Error(error.message);
      }
    },
  };
}

function createAuthGateway(): AuthGateway {
  if (isCloudAuthConfigured) {
    return createSupabaseAuthGateway();
  }
  return createDisabledAuthGateway();
}

export const authGateway: AuthGateway = createAuthGateway();
