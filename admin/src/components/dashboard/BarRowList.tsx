export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Optional secondary line under the bar (e.g. a per-type breakdown). */
  detail?: string;
}

interface BarRowListProps {
  rows: BarRow[];
  emptyNote: string;
}

/** Non-zero bars stay visible even when dwarfed by the max. */
const MIN_VISIBLE_WIDTH_PERCENT = 2;

function barWidth(value: number, max: number): string {
  if (value <= 0) return "0%";
  return `${Math.max(MIN_VISIBLE_WIDTH_PERCENT, (value / max) * 100)}%`;
}

/** Horizontal CSS bar rows scaled to the largest row value. */
export function BarRowList({ rows, emptyNote }: BarRowListProps) {
  if (rows.length === 0) return <p className="subtle small">{emptyNote}</p>;

  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <div className="bar-rows">
      {rows.map((row) => (
        <div key={row.key} className="bar-row" title={`${row.label}: ${row.value}`}>
          <span className="bar-row-label">{row.label}</span>
          <div className="bar-row-track">
            <div className="bar-row-fill" style={{ width: barWidth(row.value, max) }} />
          </div>
          <span className="bar-row-value">{row.value}</span>
          {row.detail && <span className="bar-row-detail">{row.detail}</span>}
        </div>
      ))}
    </div>
  );
}
