import { useState } from "react";
import { User, Loader2, LogOut, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import type { AuthUser } from "../../../lib/authGateway";
import { performFullSignOut } from "../../../lib/fullSignOut";
import { importLocalDataToCloud, type CloudImportCounts } from "../../../services/cloudImportService";

interface CloudAccountSectionProps {
  authUser: AuthUser;
  signOut: () => Promise<void>;
}

// Sums every entity in a CloudImportCounts-shaped object. Shared by both the
// imported total and the sourceCounts total below so they can never drift
// apart over which entities they cover (see the reviewStates regression
// test in CloudAccountSection.test.tsx).
function totalCounts(counts: CloudImportCounts): number {
  return (
    counts.phrases +
    counts.reviewStates +
    counts.sessions +
    counts.tags +
    counts.conversationLessons +
    counts.lessonProgress +
    counts.profile
  );
}

/**
 * Cloud account card: signed-in email, cloud sign-out, and the one-way
 * local-to-cloud data import. Render only when cloud auth is enabled and a
 * user is signed in — the parent owns that gate.
 */
export function CloudAccountSection({ authUser, signOut }: CloudAccountSectionProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const handleImportToCloud = async () => {
    if (isImporting) return;
    const confirmed = window.confirm(
      "Copy this device's data to your account? This is one-way — your local data stays on this device and is not deleted."
    );
    if (!confirmed) return;
    setIsImporting(true);
    try {
      const counts = await importLocalDataToCloud();
      const total = totalCounts(counts);
      if (total > 0) {
        // reviewStates has no dedicated slot in the sentence above — append
        // it only when nonzero so the message stays truthful without
        // cluttering the common case (most imports don't touch it).
        const reviewStatesNote = counts.reviewStates > 0 ? `, ${counts.reviewStates} review schedules` : "";
        toast.success(
          `Imported ${counts.phrases} phrases, ${counts.sessions} sessions, ${counts.conversationLessons} lessons, ${counts.tags} tags${reviewStatesNote}.`
        );
      } else {
        // Nothing was newly imported — sourceCounts (total local rows, import
        // status aside) tells apart a genuinely empty device from one whose
        // data already matches the cloud (PROF-07). Same totalCounts helper
        // as above, so both totals cover the same entity set.
        toast.success(
          totalCounts(counts.sourceCounts) === 0
            ? "This device has no local data to import."
            : "Nothing new to import — your account already has this device's data."
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed. Please try again.");
    } finally {
      setIsImporting(false);
    }
  };

  // Reuses the same full sign-out flow as the bottom Sign Out button
  // (src/lib/fullSignOut.ts): ends the cloud session, clears both gate
  // flags, and reloads. The reload is what flushes the signed-out user's
  // profile/library out of React state — without it the next "Continue as
  // Guest" on this device would still see the previous account's data.
  const handleCloudSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await performFullSignOut({ hasCloudSession: true, signOutCloud: signOut });
      // No success toast: the reload above navigates away before it could
      // ever be seen.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to sign out. Please try again.");
      setIsSigningOut(false);
    }
  };

  return (
    <section>
      <div className="bg-card rounded-2xl shadow-sm border border-border-subtle overflow-hidden divide-y divide-border-subtle">
        <div className="flex items-center justify-between p-4 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <User size={18} className="text-faint shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Account</p>
              <p className="text-xs text-faint mt-0.5 truncate">{authUser.email ?? "Signed in"}</p>
            </div>
          </div>
          <button
            onClick={handleCloudSignOut}
            disabled={isSigningOut}
            className="flex items-center gap-1.5 text-sm font-semibold text-red-500 hover:text-red-600 transition-colors disabled:opacity-60 shrink-0"
          >
            {isSigningOut ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
            Sign out
          </button>
        </div>
        <div className="p-4">
          <button
            onClick={handleImportToCloud}
            disabled={isImporting}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-blue/10 text-brand-blue text-sm font-semibold hover:bg-brand-blue/15 transition-colors disabled:opacity-60"
          >
            {isImporting ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
            {isImporting ? "Importing…" : "Import this device's data to your account"}
          </button>
          <p className="text-xs text-faint mt-2 text-center">
            One-way copy — your local data is not deleted.
          </p>
        </div>
      </div>
    </section>
  );
}
