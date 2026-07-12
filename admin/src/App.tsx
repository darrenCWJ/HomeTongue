import { useState } from "react";
import { isConfigured } from "./lib/supabase";
import { useAdminSession } from "./hooks/useAdminSession";
import { ConfigMissingScreen } from "./components/ConfigMissingScreen";
import { SignInScreen } from "./components/SignInScreen";
import { NotAdminScreen } from "./components/NotAdminScreen";
import { AppHeader, type AdminTab } from "./components/AppHeader";
import { ReviewQueuePage } from "./pages/ReviewQueuePage";
import { DashboardPage } from "./pages/DashboardPage";

export default function App() {
  const [tab, setTab] = useState<AdminTab>("review");
  const { gate, userId, userEmail, signOut } = useAdminSession();

  if (!isConfigured) return <ConfigMissingScreen />;
  if (gate === "signed-out") return <SignInScreen />;
  if (gate === "not-admin") return <NotAdminScreen email={userEmail} onSignOut={signOut} />;

  if (gate === "admin" && userId) {
    return (
      <div className="app-shell">
        <AppHeader tab={tab} onTabChange={setTab} email={userEmail} onSignOut={signOut} />
        <main className="app-main">
          {tab === "review" ? <ReviewQueuePage reviewerId={userId} /> : <DashboardPage />}
        </main>
      </div>
    );
  }

  return (
    <div className="screen">
      <p className="subtle">Loading…</p>
    </div>
  );
}
