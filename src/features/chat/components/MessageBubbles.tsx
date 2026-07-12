import React, { useState } from "react";
import { Bookmark, RotateCcw, ThumbsDown, ThumbsUp, Volume2 } from "lucide-react";
import { motion } from "motion/react";
import type { Message, Tone, TranslationVariant } from "../../../types";
import { RegisterChips } from "./RegisterChips";

export interface BubblePointerHandlers {
  onBubblePointerDown: (e: React.PointerEvent, msg: Message) => void;
  onBubblePointerMove: (e: React.PointerEvent) => void;
  onBubblePointerCancel: () => void;
}

interface IncomingCantoneseBubbleProps extends BubblePointerHandlers {
  msg: Message;
  isFirstBotMsg: boolean;
  isPlaying: boolean;
  playingId: string | null;
  isBookmarked: boolean;
  onToggleBookmark: (id: string) => void;
  onReplay: (id: string, text: string) => void;
  onUpdateMessage: (id: string, updates: Partial<Message>) => void;
}

export function IncomingCantoneseBubble({
  msg,
  isFirstBotMsg,
  isPlaying,
  playingId,
  isBookmarked,
  onToggleBookmark,
  onReplay,
  onUpdateMessage,
  onBubblePointerDown,
  onBubblePointerMove,
  onBubblePointerCancel,
}: IncomingCantoneseBubbleProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-end gap-2 justify-start"
    >
      <div className="w-8 h-8 rounded-full bg-brand-red/15 flex items-center justify-center flex-shrink-0 mb-1 text-xs font-bold text-brand-red">
        粵
      </div>
      <div className="flex flex-col max-w-[78%]">
        <div
          {...(isFirstBotMsg ? { "data-tour": "chat-message-bubble" } : {})}
          className="relative bg-white rounded-2xl rounded-bl-sm shadow-sm border border-zinc-200 px-4 py-3"
          onPointerDown={(e) => onBubblePointerDown(e, msg)}
          onPointerUp={onBubblePointerCancel}
          onPointerMove={onBubblePointerMove}
          onPointerLeave={onBubblePointerCancel}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            {...(isFirstBotMsg ? { "data-tour": "chat-bookmark-button" } : {})}
            onClick={() => onToggleBookmark(msg.id)}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute top-2 right-2 text-zinc-300 hover:text-zinc-500 transition-colors"
          >
            <Bookmark size={14} className={isBookmarked ? "fill-zinc-600 text-zinc-600" : ""} />
          </button>
          <p className="text-lg font-semibold text-zinc-900 leading-snug pr-5">{msg.text}</p>
          <p className="text-xs text-brand-blue mt-1 font-medium">{msg.englishTranslation}</p>
          <div className="mt-2 pt-2 border-t border-zinc-100">
            <button
              {...(isFirstBotMsg ? { "data-tour": "chat-replay-button" } : {})}
              onClick={() => onReplay(msg.id, msg.text)}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={!!playingId}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 disabled:opacity-50 transition-colors"
            >
              {isPlaying ? <Volume2 size={12} className="animate-pulse" /> : <RotateCcw size={12} />}
              {isPlaying ? "Playing..." : "Replay"}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1 mt-1 ml-1">
          <button
            onClick={() => onUpdateMessage(msg.id, { rating: msg.rating === "up" ? undefined : "up" })}
            className={`p-1 rounded transition-colors ${msg.rating === "up" ? "text-green-600 bg-green-50" : "text-zinc-300 hover:text-green-500"}`}
          >
            <ThumbsUp size={12} className={msg.rating === "up" ? "fill-green-600" : ""} />
          </button>
          <button
            onClick={() => onUpdateMessage(msg.id, { rating: msg.rating === "down" ? undefined : "down" })}
            className={`p-1 rounded transition-colors ${msg.rating === "down" ? "text-red-500 bg-red-50" : "text-zinc-300 hover:text-red-400"}`}
          >
            <ThumbsDown size={12} className={msg.rating === "down" ? "fill-red-500" : ""} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

interface OutgoingReplyBubbleProps extends BubblePointerHandlers {
  msg: Message;
  defaultTone: Tone;
  isPlaying: boolean;
  playingId: string | null;
  isBookmarked: boolean;
  onToggleBookmark: (id: string, displayedVariant?: TranslationVariant) => void;
  onReplay: (id: string, text: string) => void;
  onUpdateMessage: (id: string, updates: Partial<Message>) => void;
}

export function OutgoingReplyBubble({
  msg,
  defaultTone,
  isPlaying,
  playingId,
  isBookmarked,
  onToggleBookmark,
  onReplay,
  onUpdateMessage,
  onBubblePointerDown,
  onBubblePointerMove,
  onBubblePointerCancel,
}: OutgoingReplyBubbleProps) {
  const [selectedTone, setSelectedTone] = useState<Tone>(defaultTone);
  const displayedVariant = msg.variants?.[selectedTone];
  const dialectText = displayedVariant?.text ?? msg.cantoneseText;
  const pronunciationText = displayedVariant?.pronunciation ?? msg.pronunciation;

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-end gap-2 justify-end"
    >
      <div className="flex flex-col items-end max-w-[78%]">
        <div
          className="relative bg-brand-blue text-white rounded-2xl rounded-br-sm shadow-sm px-4 py-3"
          onPointerDown={(e) => onBubblePointerDown(e, msg)}
          onPointerUp={onBubblePointerCancel}
          onPointerMove={onBubblePointerMove}
          onPointerLeave={onBubblePointerCancel}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            onClick={() => onToggleBookmark(msg.id, displayedVariant)}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute top-2 right-2 text-white/40 hover:text-white transition-colors"
          >
            <Bookmark size={14} className={isBookmarked ? "fill-white text-white" : ""} />
          </button>
          <p className="text-sm font-medium leading-snug pr-5">{msg.text}</p>
          {dialectText && <p className="text-white/80 text-base font-semibold mt-1">{dialectText}</p>}
          {pronunciationText && <p className="text-white/50 text-xs font-mono mt-0.5">{pronunciationText}</p>}
          {msg.variants && <RegisterChips selected={selectedTone} onSelect={setSelectedTone} />}
          <div className="mt-2 pt-2 border-t border-white/20">
            <button
              onClick={() => dialectText && onReplay(msg.id, dialectText)}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={!!playingId}
              className="flex items-center gap-1 text-xs text-white/60 hover:text-white disabled:opacity-50"
            >
              {isPlaying ? <Volume2 size={12} className="animate-pulse" /> : <RotateCcw size={12} />}
              {isPlaying ? "Playing..." : "Replay"}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1 mt-1 mr-1">
          <button
            onClick={() => onUpdateMessage(msg.id, { rating: msg.rating === "up" ? undefined : "up" })}
            className={`p-1 rounded transition-colors ${msg.rating === "up" ? "text-green-600 bg-green-50" : "text-zinc-300 hover:text-green-500"}`}
          >
            <ThumbsUp size={12} className={msg.rating === "up" ? "fill-green-600" : ""} />
          </button>
          <button
            onClick={() => onUpdateMessage(msg.id, { rating: msg.rating === "down" ? undefined : "down" })}
            className={`p-1 rounded transition-colors ${msg.rating === "down" ? "text-red-500 bg-red-50" : "text-zinc-300 hover:text-red-400"}`}
          >
            <ThumbsDown size={12} className={msg.rating === "down" ? "fill-red-500" : ""} />
          </button>
        </div>
      </div>
      <div className="w-8 h-8 rounded-full bg-brand-blue/15 flex items-center justify-center flex-shrink-0 mb-1 text-xs font-bold text-brand-blue">
        EN
      </div>
    </motion.div>
  );
}

export function PlainBotBubble({ msg }: { msg: Message }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start pl-10">
      <div className="max-w-[78%] bg-white border border-zinc-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
        <p className="text-sm text-zinc-700">{msg.text}</p>
      </div>
    </motion.div>
  );
}
