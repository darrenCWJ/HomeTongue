import type { DashboardImprovement } from "../../types";
import { StatTile } from "./StatTile";

interface ImprovementSectionProps {
  improvement: DashboardImprovement;
}

/** Lessons averaging below this accuracy get the red flag treatment. */
const LOW_ACCURACY_THRESHOLD = 60;

function accuracyClass(accuracy: number): string {
  if (accuracy < LOW_ACCURACY_THRESHOLD) return "badge-score-low";
  if (accuracy < 80) return "badge-score-mid";
  return "badge-score-high";
}

/** Same 80/50 bands as SampleCard's score badge. */
function scoreClass(score: number): string {
  if (score >= 80) return "badge-score-high";
  if (score >= 50) return "badge-score-mid";
  return "badge-score-low";
}

/** Where the product needs work: hard lessons, STT quality, feedback signals. */
export function ImprovementSection({ improvement }: ImprovementSectionProps) {
  return (
    <>
      <h3 className="section-title">Improvement signals</h3>

      <div className="card">
        <h3>Hardest lessons</h3>
        {improvement.hardest_lessons.length === 0 ? (
          <p className="subtle small">No lesson accuracy recorded yet.</p>
        ) : (
          <table className="stats-table">
            <tbody>
              {improvement.hardest_lessons.map((lesson) => (
                <tr key={lesson.lesson_id}>
                  <td>
                    <code>{lesson.lesson_id}</code>
                  </td>
                  <td>{lesson.users} users</td>
                  <td>
                    <span className={`badge ${accuracyClass(lesson.avg_accuracy)}`}>
                      {Math.round(lesson.avg_accuracy)}% avg
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Speech recognition by language</h3>
        {improvement.stt_by_language.length === 0 ? (
          <p className="subtle small">No speech samples yet.</p>
        ) : (
          <table className="stats-table">
            <tbody>
              {improvement.stt_by_language.map((entry) => (
                <tr key={entry.language}>
                  <td>
                    <span className="badge badge-language">{entry.language}</span>
                  </td>
                  <td>{entry.samples} samples</td>
                  <td>
                    {entry.avg_score === null ? (
                      <span className="subtle small">no scores</span>
                    ) : (
                      <span className={`badge ${scoreClass(entry.avg_score)}`}>
                        {Math.round(entry.avg_score)} avg
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="stats-grid">
        <StatTile value={improvement.transcript_edits} label="transcript edits" />
        <StatTile value={improvement.suggestion_ratings_up} label="suggestions rated up" />
        <StatTile value={improvement.suggestion_ratings_down} label="suggestions rated down" />
      </div>
    </>
  );
}
