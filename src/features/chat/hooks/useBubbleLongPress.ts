import React, { useRef } from "react";
import type { Message } from "../../../types";

const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_THRESHOLD = 8;

/**
 * Long-press detection on chat bubbles. Fires `onLongPress` with the message
 * and its dialect text after a 500ms hold, cancelled by movement or release.
 */
export function useBubbleLongPress(onLongPress: (msg: Message, preText: string) => void) {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const handleBubblePointerDown = (e: React.PointerEvent, msg: Message) => {
    longPressStartPosRef.current = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = setTimeout(() => {
      const preText = msg.sender === "bot" ? msg.text : (msg.cantoneseText ?? "");
      if (!preText) return;
      onLongPress(msg, preText);
      longPressTimerRef.current = null;
    }, LONG_PRESS_MS);
  };

  const cancelBubbleLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartPosRef.current = null;
  };

  const handleBubblePointerMove = (e: React.PointerEvent) => {
    if (!longPressStartPosRef.current || !longPressTimerRef.current) return;
    const dx = Math.abs(e.clientX - longPressStartPosRef.current.x);
    const dy = Math.abs(e.clientY - longPressStartPosRef.current.y);
    if (dx > LONG_PRESS_MOVE_THRESHOLD || dy > LONG_PRESS_MOVE_THRESHOLD) {
      cancelBubbleLongPress();
    }
  };

  return { handleBubblePointerDown, cancelBubbleLongPress, handleBubblePointerMove };
}
