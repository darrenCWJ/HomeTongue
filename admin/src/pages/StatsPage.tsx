import { useCallback, useEffect, useState } from "react";
import type { StatsSummary } from "../types";
import { fetchStats } from "../lib/reviewApi";
import { percent } from "../lib/format";

export function StatsPage() {
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setStats(null);
    try {
      setStats(await fetchStats());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="page">
      <div className="page-toolbar">
        <h2>Dataset stats</h2>
        <button className="btn btn-secondary btn-small" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {error && (
        <div className="error-banner error-banner-row">
          <span>{error}</span>
          <button className="btn btn-secondary btn-small" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {!error && stats === null && <p className="subtle loading-note">Loading stats…</p>}

      {stats && (
        <>
          <div className="stats-grid">
            <div className="card stat-tile">
              <span className="stat-value">{stats.totalSamples}</span>
              <span className="stat-label">speech samples</span>
            </div>
            <div className="card stat-tile">
              <span className="stat-value">
                {stats.totalReviews}
                <span className="stat-sub"> ({percent(stats.totalReviews, stats.totalSamples)})</span>
              </span>
              <span className="stat-label">reviewed</span>
            </div>
            <div className="card stat-tile">
              <span className="stat-value">{stats.correctionsCount}</span>
              <span className="stat-label">correction events</span>
            </div>
          </div>

          <div className="card">
            <h3>Reviews by verdict</h3>
            <table className="stats-table">
              <tbody>
                <tr>
                  <td>
                    <span className="badge badge-verdict-verified">verified</span>
                  </td>
                  <td>{stats.verdictCounts.verified}</td>
                  <td>{percent(stats.verdictCounts.verified, stats.totalReviews)}</td>
                </tr>
                <tr>
                  <td>
                    <span className="badge badge-verdict-corrected">corrected</span>
                  </td>
                  <td>{stats.verdictCounts.corrected}</td>
                  <td>{percent(stats.verdictCounts.corrected, stats.totalReviews)}</td>
                </tr>
                <tr>
                  <td>
                    <span className="badge badge-verdict-rejected">rejected</span>
                  </td>
                  <td>{stats.verdictCounts.rejected}</td>
                  <td>{percent(stats.verdictCounts.rejected, stats.totalReviews)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>Samples by language</h3>
            {stats.languageCounts.length === 0 ? (
              <p className="subtle small">No samples yet.</p>
            ) : (
              <table className="stats-table">
                <tbody>
                  {stats.languageCounts.map(({ language, count }) => (
                    <tr key={language}>
                      <td>
                        <span className="badge badge-language">{language}</span>
                      </td>
                      <td>{count}</td>
                      <td>{percent(count, stats.totalSamples)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </section>
  );
}
