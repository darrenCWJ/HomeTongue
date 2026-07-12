import { HelpCircle, MessageCircle, BookOpen, Bookmark, User } from "lucide-react";
import { useNavigate } from "react-router";
import { useTour } from "../../../app/components/tour/TourProvider";

/** Per-surface tour replay buttons (tour anchor: profile-tour-replay). */
export function TourReplaySection() {
  const { startTour } = useTour();
  const navigate = useNavigate();

  return (
    <section data-tour="profile-tour-replay">
      <div className="flex items-center gap-2 mb-3 px-2">
        <HelpCircle size={18} className="text-faint" />
        <h2 className="text-sm font-semibold text-foreground/90 uppercase tracking-wider">Replay Tour</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { id: "chat" as const, label: "Chat", icon: <MessageCircle size={20} />, path: "/" },
          { id: "learn" as const, label: "Learn", icon: <BookOpen size={20} />, path: "/learn" },
          {
            id: "bookmarks" as const,
            label: "Bookmarks",
            icon: <Bookmark size={20} />,
            path: "/bookmarks",
          },
          { id: "profile" as const, label: "Profile", icon: <User size={20} />, path: "/profile" },
        ].map((tour) => (
          <button
            key={tour.id}
            onClick={() => {
              if (tour.id === "profile") {
                startTour("profile");
              } else {
                navigate(tour.path);
                setTimeout(() => startTour(tour.id), 300);
              }
            }}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border border-border-subtle shadow-sm hover:border-brand-blue/50 hover:bg-brand-blue/10 transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-brand-blue/10 flex items-center justify-center text-brand-blue">
              {tour.icon}
            </div>
            <span className="text-sm font-semibold text-foreground/90">{tour.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
