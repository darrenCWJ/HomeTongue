import { ShieldCheck } from "lucide-react";
import type { UserProfile } from "../../../types";

interface DataPrivacySectionProps {
  userProfile: UserProfile | null;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
}

/**
 * Data & privacy consent toggles for the ML data pipeline
 * (docs/ML_PIPELINE.md). Audio retention is gated on data collection consent;
 * withdrawing the latter also withdraws the former.
 */
export function DataPrivacySection({ userProfile, updateUserProfile }: DataPrivacySectionProps) {
  const hasDataConsent = userProfile?.dataCollectionConsent === true;
  const hasAudioConsent = hasDataConsent && userProfile?.audioRetentionConsent === true;

  const handleToggleDataConsent = () => {
    const next = !hasDataConsent;
    updateUserProfile({
      dataCollectionConsent: next,
      // Withdrawing data consent also withdraws the stricter audio consent.
      ...(next ? {} : { audioRetentionConsent: false }),
      consentUpdatedAt: new Date().toISOString(),
    });
  };

  const handleToggleAudioConsent = () => {
    if (!hasDataConsent) return;
    updateUserProfile({
      audioRetentionConsent: !hasAudioConsent,
      consentUpdatedAt: new Date().toISOString(),
    });
  };

  return (
    <section>
      <div className="flex items-center gap-2 mb-3 px-2">
        <ShieldCheck size={18} className="text-faint" />
        <h2 className="text-sm font-semibold text-foreground/90 uppercase tracking-wider">
          Data &amp; privacy
        </h2>
      </div>
      <div className="bg-card rounded-2xl shadow-sm border border-border-subtle overflow-hidden divide-y divide-border-subtle">
        <div className="flex items-center justify-between p-4 gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Help improve dialect recognition</p>
            <p className="text-xs text-faint mt-0.5">
              Share your practice phrases, transcripts, corrections and scores to train better dialect
              models — trained reviewers may review them to correct transcriptions
            </p>
          </div>
          <button
            onClick={handleToggleDataConsent}
            aria-label="Toggle data collection consent"
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${
              hasDataConsent ? "bg-brand-blue" : "bg-switch-background"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                hasDataConsent ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
        <div
          className={`flex items-center justify-between p-4 gap-3 ${hasDataConsent ? "" : "opacity-50"}`}
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Also keep my recordings</p>
            <p className="text-xs text-faint mt-0.5">
              Additionally, your recordings may be securely stored and reviewed by trained reviewers to
              improve speech recognition
            </p>
          </div>
          <button
            onClick={handleToggleAudioConsent}
            disabled={!hasDataConsent}
            aria-label="Toggle audio retention consent"
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 disabled:cursor-not-allowed ${
              hasAudioConsent ? "bg-brand-blue" : "bg-switch-background"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                hasAudioConsent ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>
      <p className="text-xs text-faint mt-2 px-2">
        Both are off by default. Withdrawing consent stops future collection; your data is deleted with
        your account.
      </p>
    </section>
  );
}
