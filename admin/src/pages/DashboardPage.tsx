import { useCallback, useEffect, useState } from "react";
import type { DashboardStats, StatsSummary } from "../types";
import { fetchDashboardStats } from "../lib/statsApi";
import { fetchStats } from "../lib/reviewApi";
import { formatDate } from "../lib/format";
import { OverviewSection } from "../components/dashboard/OverviewSection";
import { DailyActivityChart } from "../components/dashboard/DailyActivityChart";
import { EngagementSection } from "../components/dashboard/EngagementSection";
import { ImprovementSection } from "../components/dashboard/ImprovementSection";
import { ReviewPipelineSection } from "../components/dashboard/ReviewPipelineSection";

type DaysWindow = 7 | 30 | 90;

const DAY_OPTIONS: readonly DaysWindow[] = [7, 30, 90];

/**
 * Product analytics for the owner: audience, per-language usage, daily
 * activity, engagement, improvement signals, and the speech review pipeline —
 * one stats destination. Powered by the admin_dashboard_stats RPC (0007) plus
 * the review-pipeline queries in reviewApi.
 */
export function DashboardPage() {
  const [daysWindow, setDaysWindow] = useState<DaysWindow>(30);
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [pipeline, setPipeline] = useState<StatsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (windowDays: DaysWindow) => {
    setError(null);
    setDashboard(null);
    setPipeline(null);
    try {
      const [dashboardStats, reviewStats] = await Promise.all([
        fetchDashboardStats(windowDays),
        fetchStats(),
      ]);
      setDashboard(dashboardStats);
      setPipeline(reviewStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the dashboard");
    }
  }, []);

  useEffect(() => {
    void load(daysWindow);
  }, [load, daysWindow]);

  const isLoading = !error && (dashboard === null || pipeline === null);

  return (
    <section className="page">
      <div className="page-toolbar">
        <div>
          <h2>Dashboard</h2>
          {dashboard && <p className="subtle small">as of {formatDate(dashboard.generated_at)}</p>}
        </div>
        <div className="toolbar-actions">
          <div className="range-toggle" role="group" aria-label="Days window">
            {DAY_OPTIONS.map((option) => (
              <button
                key={option}
                className={`range-btn${option === daysWindow ? " range-btn-active" : ""}`}
                onClick={() => setDaysWindow(option)}
              >
                {option}d
              </button>
            ))}
          </div>
          <button className="btn btn-secondary btn-small" onClick={() => void load(daysWindow)}>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner error-banner-row">
          <span>{error}</span>
          <button className="btn btn-secondary btn-small" onClick={() => void load(daysWindow)}>
            Retry
          </button>
        </div>
      )}

      {isLoading && <p className="subtle loading-note">Loading dashboard…</p>}

      {dashboard && pipeline && (
        <>
          {dashboard.overview.total_users === 0 && (
            <p className="note-banner">
              No users in these stats yet — they only cover cloud-mode signed-in accounts, and
              production runs in local mode until the Supabase env vars are set on Vercel.
            </p>
          )}

          <OverviewSection overview={dashboard.overview} languages={dashboard.languages} />

          <h3 className="section-title">Activity — last {daysWindow} days</h3>
          <div className="card">
            <DailyActivityChart daily={dashboard.daily} />
          </div>

          <EngagementSection engagement={dashboard.engagement} />
          <ImprovementSection improvement={dashboard.improvement} />
          <ReviewPipelineSection stats={pipeline} />
        </>
      )}
    </section>
  );
}
