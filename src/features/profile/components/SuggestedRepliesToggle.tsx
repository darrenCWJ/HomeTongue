import { Sparkles } from "lucide-react";
import type { UserProfile } from "../../../types";

interface SuggestedRepliesToggleProps {
  userProfile: UserProfile | null;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
}

/** On/off switch for AI reply suggestions in chat (default on). */
export function SuggestedRepliesToggle({ userProfile, updateUserProfile }: SuggestedRepliesToggleProps) {
  return (
    <section>
      <div className="bg-card rounded-2xl shadow-sm border border-border-subtle overflow-hidden">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-faint" />
            <div>
              <p className="text-sm font-semibold text-foreground">Suggested Replies</p>
              <p className="text-xs text-faint mt-0.5">
                {userProfile?.suggestedRepliesEnabled !== false
                  ? "Showing reply suggestions in chat"
                  : "Suggestions hidden"}
              </p>
            </div>
          </div>
          <button
            onClick={() =>
              updateUserProfile({
                suggestedRepliesEnabled: userProfile?.suggestedRepliesEnabled === false,
              })
            }
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
              userProfile?.suggestedRepliesEnabled !== false ? "bg-brand-blue" : "bg-switch-background"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                userProfile?.suggestedRepliesEnabled !== false ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>
    </section>
  );
}
