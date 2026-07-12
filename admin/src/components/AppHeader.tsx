export type AdminTab = "review" | "stats";

interface AppHeaderProps {
  tab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  email: string | null;
  onSignOut: () => Promise<void>;
}

export function AppHeader({ tab, onTabChange, email, onSignOut }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header-left">
        <span className="app-title">HomeTongue Admin</span>
        <nav className="app-tabs" aria-label="Admin sections">
          <button
            className={`tab${tab === "review" ? " tab-active" : ""}`}
            onClick={() => onTabChange("review")}
          >
            Review queue
          </button>
          <button
            className={`tab${tab === "stats" ? " tab-active" : ""}`}
            onClick={() => onTabChange("stats")}
          >
            Stats
          </button>
        </nav>
      </div>
      <div className="app-header-right">
        {email && <span className="subtle small">{email}</span>}
        <button className="btn btn-secondary btn-small" onClick={() => void onSignOut()}>
          Sign out
        </button>
      </div>
    </header>
  );
}
