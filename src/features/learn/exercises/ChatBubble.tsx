import type { ConversationTurn } from "../../../types";

export function ChatBubble({ turn, dimmed }: { turn: ConversationTurn; dimmed?: boolean }) {
  const isUser = turn.speaker === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} ${dimmed ? "opacity-50" : ""}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? "bg-brand-blue/100 text-white rounded-br-sm"
            : "bg-white border border-zinc-100 text-zinc-800 rounded-bl-sm"
        }`}
      >
        <p className={`text-sm font-semibold ${isUser ? "text-white" : "text-zinc-800"}`}>{turn.dialect}</p>
        <p className={`text-xs mt-0.5 ${isUser ? "text-brand-blue/60" : "text-zinc-400"}`}>
          {turn.romanization}
        </p>
      </div>
    </div>
  );
}
