import type { DashboardEngagement } from "../../types";
import { percent } from "../../lib/format";
import { StatTile } from "./StatTile";

interface EngagementSectionProps {
  engagement: DashboardEngagement;
}

/** How much learners actually do: phrases, sessions, lessons, SRS, exams. */
export function EngagementSection({ engagement }: EngagementSectionProps) {
  return (
    <>
      <h3 className="section-title">Engagement</h3>
      <div className="stats-grid">
        <StatTile value={engagement.phrases_total} label="phrases saved" />
        <StatTile
          value={engagement.phrases_bookmarked}
          sub={`(${percent(engagement.phrases_bookmarked, engagement.phrases_total)})`}
          label="bookmarked"
        />
        <StatTile value={engagement.sessions_total} label="chat sessions" />
        <StatTile value={engagement.lessons_started} label="lessons started" />
        <StatTile
          value={engagement.lessons_completed}
          sub={`(${percent(engagement.lessons_completed, engagement.lessons_started)})`}
          label="lessons completed"
        />
        <StatTile value={engagement.srs_active_users} label="SRS active users" />
        <StatTile value={engagement.review_states_total} label="SRS cards tracked" />
        <StatTile value={engagement.exam_attempts} label="exam attempts" />
        <StatTile
          value={engagement.avg_exam_score === null ? "—" : Math.round(engagement.avg_exam_score)}
          label="avg exam score"
        />
      </div>
    </>
  );
}
