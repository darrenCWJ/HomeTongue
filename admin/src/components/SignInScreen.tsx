import { useState, type FormEvent } from "react";
import { getSupabase } from "../lib/supabase";

/**
 * Email + password sign-in only. There is deliberately no sign-up UI:
 * admin accounts are created by the project owner (see admin/README.md).
 */
export function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await getSupabase().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      setError(signInError.message);
      setSubmitting(false);
    }
    // On success the auth listener re-renders the app; nothing to do here.
  }

  return (
    <div className="screen">
      <div className="screen-card">
        <h1>HomeTongue Admin</h1>
        <p className="subtle">Data labeling &amp; oversight — admins only.</p>
        <form className="signin-form" onSubmit={handleSubmit}>
          <label htmlFor="admin-email">Email</label>
          <input
            id="admin-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && <p className="error-banner">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="subtle small">
          No sign-up here — admin accounts are created by the project owner.
        </p>
      </div>
    </div>
  );
}
