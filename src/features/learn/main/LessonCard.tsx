import { BookOpen, ChevronRight } from "lucide-react";

// ─── LessonCard ───────────────────────────────────────────────────────────────

export function LessonCard({
  title,
  subtitle,
  progress,
  onClick,
}: {
  title: string;
  subtitle: string;
  progress: number;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl p-4 shadow-sm border border-zinc-100 flex items-center gap-4 active:scale-[0.98] transition-transform cursor-pointer hover:border-brand-blue/15 hover:shadow-md"
    >
      <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center flex-shrink-0">
        <BookOpen size={20} className="text-zinc-600" />
      </div>
      <div className="flex-1">
        <h4 className="font-semibold text-sm text-zinc-800">{title}</h4>
        <p className="text-xs text-zinc-500 mb-2">{subtitle}</p>
        <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-brand-blue/100 h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <ChevronRight size={20} className="text-zinc-300" />
    </div>
  );
}
