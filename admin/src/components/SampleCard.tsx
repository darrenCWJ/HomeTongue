import { useState } from "react";
import type { ReviewVerdict, SpeechSample } from "../types";
import { submitReview } from "../lib/reviewApi";
import { formatDate } from "../lib/format";
import { AudioPlayer } from "./AudioPlayer";

interface SampleCardProps {
  sample: SpeechSample;
  reviewerId: string;
  onReviewed: (sampleId: string, verdict: ReviewVerdict) => void;
}

type PanelMode = "none" | "corrected" | "rejected";

function scoreClass(score: number): string {
  if (score >= 80) return "badge-score-high";
  if (score >= 50) return "badge-score-mid";
  return "badge-score-low";
}

export function SampleCard({ sample, reviewerId, onReviewed }: SampleCardProps) {
  const [panel, setPanel] = useState<PanelMode>("none");
  const [correctedText, setCorrectedText] = useState(sample.transcript);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasExpected = sample.expected_text !== null && sample.expected_text.trim().length > 0;
  const hasMismatch = hasExpected && sample.expected_text?.trim() !== sample.transcript.trim();
  const trimmedCorrection = correctedText.trim();
  const correctionIsValid = trimmedCorrection.length > 0 && trimmedCorrection !== sample.transcript.trim();

  function togglePanel(mode: PanelMode) {
    setError(null);
    setPanel((current) => (current === mode ? "none" : mode));
  }

  async function submit(verdict: ReviewVerdict) {
    setSubmitting(true);
    setError(null);
    try {
      await submitReview({
        sampleId: sample.id,
        reviewerId,
        verdict,
        correctedText: verdict === "corrected" ? trimmedCorrection : null,
        notes: verdict === "rejected" && notes.trim().length > 0 ? notes.trim() : null,
      });
      onReviewed(sample.id, verdict);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the review");
      setSubmitting(false);
    }
  }

  return (
    <article className="card sample-card">
      <div className="card-meta">
        <span className={`badge badge-source-${sample.source}`}>{sample.source}</span>
        <span className="badge badge-language">{sample.language}</span>
        {sample.score !== null && (
          <span className={`badge ${scoreClass(sample.score)}`}>score {sample.score}</span>
        )}
        <span className="card-date">{formatDate(sample.created_at)}</span>
      </div>

      <div className={`text-pair${hasMismatch ? " text-pair-mismatch" : ""}`}>
        {hasExpected && (
          <div className="text-block">
            <span className="text-label">Expected</span>
            <p className="text-content">{sample.expected_text}</p>
          </div>
        )}
        <div className="text-block">
          <span className="text-label">Transcript (STT)</span>
          <p className="text-content">{sample.transcript}</p>
        </div>
        {sample.corrected_text && (
          <div className="text-block">
            <span className="text-label">Learner's own correction</span>
            <p className="text-content">{sample.corrected_text}</p>
          </div>
        )}
      </div>
      {hasMismatch && (
        <p className="mismatch-note">Expected text and transcript differ — listen before judging.</p>
      )}

      {sample.audio_url ? (
        <AudioPlayer path={sample.audio_url} />
      ) : (
        <p className="subtle small">No audio retained for this sample — review the text only.</p>
      )}

      <div className="card-footer-meta">
        {sample.stt_model && <span>model: {sample.stt_model}</span>}
        {sample.device && <span>device: {sample.device}</span>}
      </div>

      <div className="actions">
        <button className="btn btn-verified" disabled={submitting} onClick={() => void submit("verified")}>
          Verified
        </button>
        <button
          className={`btn btn-corrected${panel === "corrected" ? " btn-open" : ""}`}
          disabled={submitting}
          onClick={() => togglePanel("corrected")}
        >
          Corrected…
        </button>
        <button
          className={`btn btn-rejected${panel === "rejected" ? " btn-open" : ""}`}
          disabled={submitting}
          onClick={() => togglePanel("rejected")}
        >
          Rejected…
        </button>
      </div>

      {panel === "corrected" && (
        <div className="panel">
          <label htmlFor={`correction-${sample.id}`}>
            Corrected transcript (edit to what was actually said)
          </label>
          <textarea
            id={`correction-${sample.id}`}
            rows={3}
            value={correctedText}
            onChange={(event) => setCorrectedText(event.target.value)}
          />
          {!correctionIsValid && (
            <p className="subtle small">Edit the transcript before saving — it must be non-empty and changed.</p>
          )}
          <button
            className="btn btn-corrected"
            disabled={submitting || !correctionIsValid}
            onClick={() => void submit("corrected")}
          >
            Save correction
          </button>
        </div>
      )}

      {panel === "rejected" && (
        <div className="panel">
          <label htmlFor={`notes-${sample.id}`}>Notes (optional — why is this sample unusable?)</label>
          <textarea
            id={`notes-${sample.id}`}
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <button className="btn btn-rejected" disabled={submitting} onClick={() => void submit("rejected")}>
            Confirm reject
          </button>
        </div>
      )}

      {error && <p className="error-banner">{error}</p>}
    </article>
  );
}
