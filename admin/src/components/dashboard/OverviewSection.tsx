import type { DashboardOverview, LanguageContentCounts } from "../../types";
import { percent } from "../../lib/format";
import { StatTile } from "./StatTile";
import { BarRowList, type BarRow } from "./BarRowList";

interface OverviewSectionProps {
  overview: DashboardOverview;
  languages: LanguageContentCounts[];
}

function languageRow(language: LanguageContentCounts): BarRow {
  const total =
    language.phrases + language.sessions + language.conversation_lessons + language.speech_samples;
  return {
    key: language.language_code,
    label: language.language_code,
    value: total,
    detail: `${language.phrases} phrases · ${language.sessions} sessions · ${language.conversation_lessons} lessons · ${language.speech_samples} speech samples`,
  };
}

/** Audience: user counts, consent rates, dialects, and content per language. */
export function OverviewSection({ overview, languages }: OverviewSectionProps) {
  return (
    <>
      <h3 className="section-title">Overview</h3>
      <div className="stats-grid">
        <StatTile value={overview.total_users} label="total users" />
        <StatTile value={overview.active_users_7d} label="active (7 days)" />
        <StatTile value={overview.active_users_30d} label="active (30 days)" />
        <StatTile value={overview.new_users_7d} label="new (7 days)" />
        <StatTile value={overview.new_users_30d} label="new (30 days)" />
        <StatTile
          value={overview.data_consent_users}
          sub={`(${percent(overview.data_consent_users, overview.total_users)})`}
          label="data consent"
        />
        <StatTile
          value={overview.audio_consent_users}
          sub={`(${percent(overview.audio_consent_users, overview.total_users)})`}
          label="audio consent"
        />
      </div>

      <div className="card">
        <h3>Users by dialect</h3>
        <BarRowList
          rows={overview.users_by_dialect.map((entry) => ({
            key: entry.dialect,
            label: entry.dialect,
            value: entry.users,
          }))}
          emptyNote="No users have picked a dialect yet."
        />
      </div>

      <div className="card">
        <h3>Content by language</h3>
        <BarRowList rows={languages.map(languageRow)} emptyNote="No content recorded yet." />
      </div>
    </>
  );
}
