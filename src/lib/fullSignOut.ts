// Full sign-out for the profile page's "Sign Out" button.
//
// The client-side gates live in two places that cannot see each other: the
// access-code flag feeds ProfileProvider state, while the email-gate flag is
// read into Layout-local state only at mount. Builds without VITE_ACCESS_CODE
// compile the access gate away entirely, which previously made this button a
// silent no-op. Clearing both flags and reloading is the one path that resets
// every gate — and flushes all per-user provider state — in every build
// configuration.

const EMAIL_GATE_KEY = "ht_email_authed";
const ACCESS_GATE_KEY = "ht_signed_in";

export interface FullSignOutOptions {
  /** True when a cloud (Supabase) session exists and must be ended first. */
  hasCloudSession: boolean;
  /** Ends the cloud session (authGateway.signOut). Only called when hasCloudSession. */
  signOutCloud: () => Promise<void>;
  /** Injectable for tests; defaults to window.localStorage. */
  storage?: Pick<Storage, "removeItem">;
  /** Injectable for tests; defaults to a full page reload. */
  reload?: () => void;
}

/**
 * Signs out of everything: ends the cloud session (if any), clears both
 * client-side gate flags, and reloads so all gates and providers
 * re-initialize from the cleared state.
 *
 * If ending the cloud session fails, the error propagates and nothing local
 * is cleared — the session may still be alive, so pretending to be signed
 * out would leave the app inconsistent after the next reload.
 */
export async function performFullSignOut({
  hasCloudSession,
  signOutCloud,
  storage = window.localStorage,
  reload = () => window.location.reload(),
}: FullSignOutOptions): Promise<void> {
  if (hasCloudSession) {
    await signOutCloud();
  }
  storage.removeItem(EMAIL_GATE_KEY);
  storage.removeItem(ACCESS_GATE_KEY);
  reload();
}
