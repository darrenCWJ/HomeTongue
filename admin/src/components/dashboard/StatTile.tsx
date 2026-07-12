interface StatTileProps {
  value: string | number;
  label: string;
  /** Optional inline annotation next to the value, e.g. "(42%)". */
  sub?: string;
}

/** One numeric summary card; used across all dashboard sections. */
export function StatTile({ value, label, sub }: StatTileProps) {
  return (
    <div className="card stat-tile">
      <span className="stat-value">
        {value}
        {sub && <span className="stat-sub"> {sub}</span>}
      </span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
