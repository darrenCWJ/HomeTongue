import React from "react";
import { ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { Message, Phrase } from "../../../types";
import {
  IncomingCantoneseBubble,
  OutgoingReplyBubble,
  PlainBotBubble,
  type BubblePointerHandlers,
} from "./MessageBubbles";

interface MessageListProps extends BubblePointerHandlers {
  messages: Message[];
  phrases: Phrase[];
  playingId: string | null;
  stage: "transcribing" | "translating" | null;
  stageIsUserSide: boolean;
  stageLabel: string;
  suggestions: Phrase[];
  showSuggestions: boolean;
  isBusy: boolean;
  onReply: (englishText: string) => void;
  onToggleBookmark: (id: string) => void;
  onReplay: (id: string, text: string) => void;
  onUpdateMessage: (id: string, updates: Partial<Message>) => void;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

export function MessageList({
  messages,
  phrases,
  playingId,
  stage,
  stageIsUserSide,
  stageLabel,
  suggestions,
  showSuggestions,
  isBusy,
  onReply,
  onToggleBookmark,
  onReplay,
  onUpdateMessage,
  onBubblePointerDown,
  onBubblePointerMove,
  onBubblePointerCancel,
  messagesEndRef,
}: MessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-3 scrollbar-none">
      {messages.map((msg, msgIndex) => {
        const isIncomingCantonese = msg.sender === "bot" && !!msg.englishTranslation;
        const isFirstBotMsg =
          isIncomingCantonese &&
          msgIndex === messages.findIndex((m) => m.sender === "bot" && !!m.englishTranslation);
        const isSuggestionRow = msg.sender === "bot" && !msg.englishTranslation && !!msg.suggestions?.length;
        const isOutgoingReply = msg.sender === "user";
        const isPlaying = playingId === msg.id;
        const phraseForBookmark = msg.id ? phrases.find((p) => p.id === msg.id) : undefined;
        const isBookmarked = phraseForBookmark?.isBookmarked ?? false;

        if (isIncomingCantonese) {
          return (
            <IncomingCantoneseBubble
              key={msg.id}
              msg={msg}
              isFirstBotMsg={isFirstBotMsg}
              isPlaying={isPlaying}
              playingId={playingId}
              isBookmarked={isBookmarked}
              onToggleBookmark={onToggleBookmark}
              onReplay={onReplay}
              onUpdateMessage={onUpdateMessage}
              onBubblePointerDown={onBubblePointerDown}
              onBubblePointerMove={onBubblePointerMove}
              onBubblePointerCancel={onBubblePointerCancel}
            />
          );
        }

        if (isSuggestionRow) return null;

        if (isOutgoingReply) {
          return (
            <OutgoingReplyBubble
              key={msg.id}
              msg={msg}
              isPlaying={isPlaying}
              playingId={playingId}
              isBookmarked={isBookmarked}
              onToggleBookmark={onToggleBookmark}
              onReplay={onReplay}
              onUpdateMessage={onUpdateMessage}
              onBubblePointerDown={onBubblePointerDown}
              onBubblePointerMove={onBubblePointerMove}
              onBubblePointerCancel={onBubblePointerCancel}
            />
          );
        }

        // Plain bot message fallback
        return <PlainBotBubble key={msg.id} msg={msg} />;
      })}

      {stage && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`flex items-start ${stageIsUserSide ? "justify-end pr-10" : "pl-10"}`}
        >
          <div
            className={`rounded-2xl px-4 py-3 shadow-sm flex items-center gap-2 ${
              stageIsUserSide
                ? "bg-brand-blue rounded-br-sm"
                : "bg-white border border-zinc-200 rounded-tl-sm"
            }`}
          >
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full animate-bounce ${stageIsUserSide ? "bg-white/60" : "bg-brand-blue/60"}`}
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
            <span className={`text-xs ${stageIsUserSide ? "text-white/80" : "text-zinc-500"}`}>
              {stageLabel}
            </span>
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="flex flex-col gap-2 pt-1 w-full"
          >
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">
              Suggested replies
            </span>
            {suggestions.map((s) => (
              <button
                key={s.id}
                onClick={() => onReply(s.original)}
                disabled={isBusy}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-brand-blue/10 border border-brand-blue/15 rounded-2xl text-sm font-medium text-zinc-700 hover:bg-brand-blue/15 hover:border-brand-blue/20 active:scale-[0.99] transition-all disabled:opacity-50 text-left"
              >
                <span>{s.original}</span>
                <ChevronRight size={16} className="text-brand-blue/60 flex-shrink-0" />
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={messagesEndRef} className="h-4" />
    </div>
  );
}
