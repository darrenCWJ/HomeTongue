export type AdminTab = "review" | "content" | "dashboard";

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
            className={`tab${tab === "content" ? " tab-active" : ""}`}
            onClick={() => onTabChange("content")}
          >
            Content
          </button>
          <button
            className={`tab${tab === "dashboard" ? " tab-active" : ""}`}
            onClick={() => onTabChange("dashboard")}
          >
            Dashboard
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
