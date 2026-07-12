import type { ReviewVerdict, StatsSummary } from "../../types";
import { percent } from "../../lib/format";
import { StatTile } from "./StatTile";

const VERDICT_ORDER: readonly ReviewVerdict[] = ["verified", "corrected", "rejected"];

interface ReviewPipelineSectionProps {
  stats: StatsSummary;
}

/** The labeling-pipeline stats formerly on the standalone Stats page. */
export function ReviewPipelineSection({ stats }: ReviewPipelineSectionProps) {
  return (
    <>
      <h3 className="section-title">Speech review pipeline</h3>
      <div className="stats-grid">
        <StatTile value={stats.totalSamples} label="speech samples" />
        <StatTile
          value={stats.totalReviews}
          sub={`(${percent(stats.totalReviews, stats.totalSamples)})`}
          label="reviewed"
        />
        <StatTile value={stats.correctionsCount} label="correction events" />
      </div>

      <div className="card">
        <h3>Reviews by verdict</h3>
        <table className="stats-table">
          <tbody>
            {VERDICT_ORDER.map((verdict) => (
              <tr key={verdict}>
                <td>
                  <span className={`badge badge-verdict-${verdict}`}>{verdict}</span>
                </td>
                <td>{stats.verdictCounts[verdict]}</td>
                <td>{percent(stats.verdictCounts[verdict], stats.totalReviews)}</td>
              </tr>
            ))}
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
  );
}
