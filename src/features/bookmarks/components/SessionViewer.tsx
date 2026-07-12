import React from "react";
import { ArrowLeft, Bookmark, Trash2, Volume2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { Message, Phrase, Session } from "../../../types";

interface SessionViewerProps {
  session: Session | null;
  onClose: () => void;
  phrases: Phrase[];
  playingId: string | null;
  pendingMsgDeletions: Set<string>;
  onPlayMessage: (
    msgId: string,
    audioDataUrl?: string,
    audioDataUrls?: string[],
    fallbackText?: string
  ) => void;
  onBookmarkMessage: (msg: Message) => void;
  onDeleteMessage: (sessionId: string, msgId: string) => void;
  onBubblePointerDown: (e: React.PointerEvent, dialectText: string, originalText: string) => void;
  onBubblePointerMove: (e: React.PointerEvent) => void;
  onBubblePointerCancel: () => void;
}

export function SessionViewer({
  session,
  onClose,
  phrases,
  playingId,
  pendingMsgDeletions,
  onPlayMessage,
  onBookmarkMessage,
  onDeleteMessage,
  onBubblePointerDown,
  onBubblePointerMove,
  onBubblePointerCancel,
}: SessionViewerProps) {
  return (
    <AnimatePresence>
      {session && (
        <motion.div
          initial={{ opacity: 0, x: "100%" }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 260 }}
          className="absolute inset-0 z-50 bg-background flex flex-col"
        >
          {/* Header */}
          <div className="bg-card px-4 py-4 border-b border-border flex items-center gap-3 shadow-sm">
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <ArrowLeft size={20} className="text-foreground/90" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground text-base truncate">
                {session.title ?? "Conversation"}
              </p>
              <p className="text-xs text-faint">
                {session.date} · {session.messages.length} messages
              </p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-none">
            {session.messages
              .filter((m) => !pendingMsgDeletions.has(m.id))
              .filter((m) => m.sender !== "bot" || !!m.englishTranslation || !!m.dialectText)
              .map((msg, i) => {
                const isBot = msg.sender === "bot";
                const displayText = isBot ? msg.text : (msg.dialectText ?? msg.text);
                const subText = isBot ? msg.englishTranslation : msg.text;
                const audioKey = `view-${session.id}-${i}`;
                const isPlaying = playingId === audioKey;
                const hasAudioForMsg =
                  !!msg.audioDataUrl || (msg.audioDataUrls && msg.audioDataUrls.length > 0);
                const fallback = isBot ? msg.text : (msg.dialectText ?? msg.text);
                const isBookmarked = phrases.find((p) => p.id === msg.id)?.isBookmarked ?? false;

                return (
                  <div key={msg.id ?? i} className="relative overflow-hidden rounded-2xl">
                    {/* Delete background revealed on swipe */}
                    <div
                      className={`absolute inset-y-0 flex items-center bg-red-500 rounded-2xl w-full ${isBot ? "left-0 pl-4 justify-start" : "right-0 pr-4 justify-end"}`}
                    >
                      <Trash2 size={18} className="text-white" />
                    </div>

                    <motion.div
                      drag="x"
                      dragDirectionLock
                      dragConstraints={isBot ? { left: 0, right: 120 } : { left: -120, right: 0 }}
                      dragElastic={0.1}
                      onDragEnd={(_e, info) => {
                        const shouldDelete = isBot ? info.offset.x > 80 : info.offset.x < -80;
                        if (shouldDelete) {
                          onDeleteMessage(session.id, msg.id);
                        }
                      }}
                      className={`relative flex items-end gap-2 bg-background ${isBot ? "justify-start" : "justify-end"}`}
                    >
                      {isBot && (
                        <div className="w-8 h-8 rounded-full bg-brand-red/15 flex items-center justify-center text-[10px] font-bold text-brand-red flex-shrink-0 mb-1">
                          粵
                        </div>
                      )}
                      <div
                        className={`relative max-w-[75%] rounded-2xl px-4 py-3 ${isBot ? "rounded-bl-sm bg-card border border-border" : "rounded-br-sm bg-brand-blue/100 text-white"}`}
                        onPointerDown={(e) => {
                          const dialectText = isBot ? (msg.text ?? "") : (msg.dialectText ?? "");
                          const originalText = isBot ? (msg.englishTranslation ?? "") : (msg.text ?? "");
                          onBubblePointerDown(e, dialectText, originalText);
                        }}
                        onPointerUp={onBubblePointerCancel}
                        onPointerMove={onBubblePointerMove}
                        onPointerLeave={onBubblePointerCancel}
                        onContextMenu={(e) => e.preventDefault()}
                      >
                        <button
                          onClick={() => onBookmarkMessage(msg)}
                          onPointerDown={(e) => e.stopPropagation()}
                          className={`absolute top-2 right-2 transition-colors ${
                            isBookmarked
                              ? isBot
                                ? "text-muted-foreground"
                                : "text-white"
                              : isBot
                                ? "text-faint hover:text-muted-foreground"
                                : "text-white/40 hover:text-white"
                          }`}
                        >
                          <Bookmark size={14} className={isBookmarked ? "fill-current" : ""} />
                        </button>
                        <p
                          className={`text-sm font-semibold leading-snug pr-6 ${isBot ? "text-foreground" : "text-white"}`}
                        >
                          {displayText}
                        </p>
                        {subText && (
                          <p className={`text-xs mt-1 ${isBot ? "text-brand-blue" : "text-white/70"}`}>
                            {subText}
                          </p>
                        )}
                        {(hasAudioForMsg || fallback) && (
                          <button
                            onClick={() =>
                              onPlayMessage(audioKey, msg.audioDataUrl, msg.audioDataUrls, fallback)
                            }
                            onPointerDown={(e) => e.stopPropagation()}
                            disabled={!!playingId}
                            className={`mt-2 flex items-center gap-1.5 text-[11px] font-medium transition-colors disabled:opacity-40
                              ${isBot ? "text-faint hover:text-brand-blue" : "text-white/60 hover:text-white"}
                            `}
                          >
                            <Volume2 size={12} className={isPlaying ? "animate-pulse" : ""} />
                            {isPlaying ? "Playing…" : hasAudioForMsg ? "Play recording" : "Play TTS"}
                          </button>
                        )}
                      </div>
                      {!isBot && (
                        <div className="w-8 h-8 rounded-full bg-brand-blue/15 flex items-center justify-center text-[10px] font-bold text-brand-blue flex-shrink-0 mb-1">
                          EN
                        </div>
                      )}
                    </motion.div>
                  </div>
                );
              })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
