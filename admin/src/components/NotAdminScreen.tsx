interface NotAdminScreenProps {
  email: string | null;
  onSignOut: () => Promise<void>;
}

export function NotAdminScreen({ email, onSignOut }: NotAdminScreenProps) {
  return (
    <div className="screen">
      <div className="screen-card">
        <h1>HomeTongue Admin</h1>
        <p className="error-banner">This account is not an admin.</p>
        {email && (
          <p className="subtle">
            Signed in as <strong>{email}</strong>.
          </p>
        )}
        <p className="subtle small">
          Ask the project owner to set <code>is_admin</code> on your profile, then sign in again.
        </p>
        <button className="btn btn-secondary" onClick={() => void onSignOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
