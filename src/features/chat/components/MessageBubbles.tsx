import React, { useState } from "react";
import { Bookmark, RotateCcw, ThumbsDown, ThumbsUp, Volume2 } from "lucide-react";
import { motion } from "motion/react";
import type { Message, Tone, TranslationVariant } from "../../../types";
import { useActiveLanguagePack } from "../../../hooks/useActiveLanguageCode";
import { RegisterChips } from "./RegisterChips";
import { SlowReplayChip } from "./SlowReplayChip";
import { WordMatchBadge } from "./WordMatchBadge";

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
  /** Active pack's TTS capability — replay controls are hidden when false. */
  ttsEnabled: boolean;
  onToggleBookmark: (id: string) => void;
  onReplay: (id: string, text: string) => void;
  /** Slow (0.7x) replay — always fresh TTS, never the cached clip. */
  onReplaySlow: (id: string, text: string) => void;
  onUpdateMessage: (id: string, updates: Partial<Message>) => void;
}

export function IncomingCantoneseBubble({
  msg,
  isFirstBotMsg,
  isPlaying,
  playingId,
  isBookmarked,
  ttsEnabled,
  onToggleBookmark,
  onReplay,
  onReplaySlow,
  onUpdateMessage,
  onBubblePointerDown,
  onBubblePointerMove,
  onBubblePointerCancel,
}: IncomingCantoneseBubbleProps) {
  // Reactive glyph: hardcoding one pack's character would be wrong after a
  // dialect switch (e.g. Hokkien sessions showing 粵).
  const { character } = useActiveLanguagePack();
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-end gap-2 justify-start"
    >
      <div className="w-8 h-8 rounded-full bg-brand-red/15 flex items-center justify-center flex-shrink-0 mb-1 text-xs font-bold text-brand-red">
        {character}
      </div>
      <div className="flex flex-col max-w-[78%]">
        <div
          {...(isFirstBotMsg ? { "data-tour": "chat-message-bubble" } : {})}
          className="relative bg-card rounded-2xl rounded-bl-sm shadow-sm border border-border px-4 py-3"
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
            className="absolute top-2 right-2 text-faint hover:text-muted-foreground transition-colors"
          >
            <Bookmark size={14} className={isBookmarked ? "fill-muted-foreground text-muted-foreground" : ""} />
          </button>
          <p className="text-lg font-semibold text-foreground leading-snug pr-5">{msg.text}</p>
          <p className="text-xs text-brand-blue mt-1 font-medium">{msg.englishTranslation}</p>
          {msg.matchScore && <WordMatchBadge matchScore={msg.matchScore} />}
          {ttsEnabled && (
            <div className="mt-2 pt-2 border-t border-border-subtle flex items-center gap-2">
              <button
                {...(isFirstBotMsg ? { "data-tour": "chat-replay-button" } : {})}
                onClick={() => onReplay(msg.id, msg.text)}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={!!playingId}
                className="flex items-center gap-1 text-xs text-faint hover:text-muted-foreground disabled:opacity-50 transition-colors"
              >
                {isPlaying ? <Volume2 size={12} className="animate-pulse" /> : <RotateCcw size={12} />}
                {isPlaying ? "Playing..." : "Replay"}
              </button>
              <SlowReplayChip
                disabled={!!playingId}
                variant="light"
                onPlay={() => onReplaySlow(msg.id, msg.text)}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 mt-1 ml-1">
          <button
            onClick={() => onUpdateMessage(msg.id, { rating: msg.rating === "up" ? undefined : "up" })}
            className={`p-1 rounded transition-colors ${msg.rating === "up" ? "text-green-600 bg-green-50" : "text-faint hover:text-green-500"}`}
          >
            <ThumbsUp size={12} className={msg.rating === "up" ? "fill-green-600" : ""} />
          </button>
          <button
            onClick={() => onUpdateMessage(msg.id, { rating: msg.rating === "down" ? undefined : "down" })}
            className={`p-1 rounded transition-colors ${msg.rating === "down" ? "text-red-500 bg-red-50" : "text-faint hover:text-red-400"}`}
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
  /** Active pack's TTS capability — replay controls are hidden when false. */
  ttsEnabled: boolean;
  onToggleBookmark: (id: string, displayedVariant?: TranslationVariant) => void;
  onReplay: (id: string, text: string) => void;
  /** Slow (0.7x) replay — always fresh TTS, never the cached clip. */
  onReplaySlow: (id: string, text: string) => void;
  onUpdateMessage: (id: string, updates: Partial<Message>) => void;
}

export function OutgoingReplyBubble({
  msg,
  defaultTone,
  isPlaying,
  playingId,
  isBookmarked,
  ttsEnabled,
  onToggleBookmark,
  onReplay,
  onReplaySlow,
  onUpdateMessage,
  onBubblePointerDown,
  onBubblePointerMove,
  onBubblePointerCancel,
}: OutgoingReplyBubbleProps) {
  const [selectedTone, setSelectedTone] = useState<Tone>(defaultTone);
  const displayedVariant = msg.variants?.[selectedTone];
  const dialectText = displayedVariant?.text ?? msg.dialectText;
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
          {ttsEnabled && (
            <div className="mt-2 pt-2 border-t border-white/20 flex items-center gap-2">
              <button
                onClick={() => dialectText && onReplay(msg.id, dialectText)}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={!!playingId}
                className="flex items-center gap-1 text-xs text-white/60 hover:text-white disabled:opacity-50"
              >
                {isPlaying ? <Volume2 size={12} className="animate-pulse" /> : <RotateCcw size={12} />}
                {isPlaying ? "Playing..." : "Replay"}
              </button>
              <SlowReplayChip
                disabled={!!playingId}
                variant="dark"
                onPlay={() => dialectText && onReplaySlow(msg.id, dialectText)}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 mt-1 mr-1">
          <button
            onClick={() => onUpdateMessage(msg.id, { rating: msg.rating === "up" ? undefined : "up" })}
            className={`p-1 rounded transition-colors ${msg.rating === "up" ? "text-green-600 bg-green-50" : "text-faint hover:text-green-500"}`}
          >
            <ThumbsUp size={12} className={msg.rating === "up" ? "fill-green-600" : ""} />
          </button>
          <button
            onClick={() => onUpdateMessage(msg.id, { rating: msg.rating === "down" ? undefined : "down" })}
            className={`p-1 rounded transition-colors ${msg.rating === "down" ? "text-red-500 bg-red-50" : "text-faint hover:text-red-400"}`}
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
      <div className="max-w-[78%] bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
        <p className="text-sm text-foreground/90">{msg.text}</p>
      </div>
    </motion.div>
  );
}
