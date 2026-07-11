import { Bookmark, RotateCcw } from "lucide-react";

export function DemoBubble() {
  return (
    <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-3 scrollbar-none">
      <div className="flex items-end gap-2 justify-start">
        <div className="w-8 h-8 rounded-full bg-brand-red/15 flex items-center justify-center flex-shrink-0 mb-1 text-xs font-bold text-brand-red">
          粵
        </div>
        <div className="flex flex-col max-w-[78%]">
          <div
            data-tour="chat-message-bubble"
            className="relative bg-white rounded-2xl rounded-bl-sm shadow-sm border border-zinc-200 px-4 py-3"
          >
            <button
              data-tour="chat-bookmark-button"
              className="absolute top-2 right-2 text-zinc-300 hover:text-zinc-500 transition-colors"
            >
              <Bookmark size={14} />
            </button>
            <p className="text-lg font-semibold text-zinc-900 leading-snug pr-5">你好，好高興認識你！</p>
            <p className="text-xs text-brand-blue mt-1 font-medium">Hello, nice to meet you!</p>
            <div className="mt-2 pt-2 border-t border-zinc-100">
              <button
                data-tour="chat-replay-button"
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                <RotateCcw size={12} />
                Replay
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
