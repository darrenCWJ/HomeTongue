import type { DailyActivity } from "../../types";
import { formatDay } from "../../lib/format";

const SERIES = [
  { key: "new_users", label: "New users", className: "series-new-users" },
  { key: "sessions", label: "Sessions", className: "series-sessions" },
  { key: "speech_samples", label: "Speech samples", className: "series-samples" },
] as const;

interface DailyActivityChartProps {
  daily: DailyActivity[];
}

function dayTooltip(entry: DailyActivity): string {
  return `${formatDay(entry.day)} — ${entry.new_users} new users, ${entry.sessions} sessions, ${entry.speech_samples} speech samples`;
}

/**
 * Compact grouped bar chart (flex columns, pure CSS) of daily new users /
 * sessions / speech samples. Tooltips via title attributes on each day column.
 */
export function DailyActivityChart({ daily }: DailyActivityChartProps) {
  if (daily.length === 0) {
    return <p className="subtle small">No activity recorded in this window.</p>;
  }

  const max = Math.max(1, ...daily.flatMap((entry) => SERIES.map((series) => entry[series.key])));
  const firstDay = daily[0];
  const lastDay = daily[daily.length - 1];

  return (
    <div>
      <div className="chart-legend">
        {SERIES.map((series) => (
          <span key={series.key} className="legend-item">
            <span className={`legend-swatch ${series.className}`} />
            {series.label}
          </span>
        ))}
      </div>
      <div className="chart-columns" role="img" aria-label="Daily activity bar chart">
        {daily.map((entry) => (
          <div key={entry.day} className="chart-day" title={dayTooltip(entry)}>
            {SERIES.map((series) => (
              <div
                key={series.key}
                className={`chart-bar ${series.className}`}
                style={{ height: `${(entry[series.key] / max) * 100}%` }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="chart-axis">
        <span>{formatDay(firstDay.day)}</span>
        <span>{formatDay(lastDay.day)}</span>
      </div>
    </div>
  );
}
