import { useState } from "react";
import { User, Loader2, LogOut, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import type { AuthUser } from "../../../lib/authGateway";
import { importLocalDataToCloud } from "../../../services/cloudImportService";

interface CloudAccountSectionProps {
  authUser: AuthUser;
  signOut: () => Promise<void>;
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
      const total =
        counts.phrases +
        counts.sessions +
        counts.tags +
        counts.conversationLessons +
        counts.lessonProgress +
        counts.profile;
      toast.success(
        total === 0
          ? "Nothing new to import — your account already has this device's data."
          : `Imported ${counts.phrases} phrases, ${counts.sessions} sessions, ${counts.conversationLessons} lessons, ${counts.tags} tags.`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed. Please try again.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleCloudSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      localStorage.removeItem("ht_email_authed");
      toast.success("Signed out of your account.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to sign out. Please try again.");
    } finally {
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
