export function ConfigMissingScreen() {
  return (
    <div className="screen">
      <div className="screen-card">
        <h1>HomeTongue Admin</h1>
        <p className="error-banner">Supabase is not configured.</p>
        <p>
          Copy <code>.env.example</code> to <code>.env</code> in the <code>admin/</code> directory and set:
        </p>
        <ul className="config-list">
          <li>
            <code>VITE_SUPABASE_URL</code>
          </li>
          <li>
            <code>VITE_SUPABASE_ANON_KEY</code>
          </li>
        </ul>
        <p className="subtle">
          Use the same values as the main app's root <code>.env</code>, then restart the dev server.
        </p>
      </div>
    </div>
  );
}
