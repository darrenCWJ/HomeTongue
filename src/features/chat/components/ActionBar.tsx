import { Keyboard, Mic, Square } from "lucide-react";

type MicMode = "cantonese" | "english";

interface ActionBarProps {
  listeningMode: MicMode | null;
  isTapMode: boolean;
  isListening: boolean;
  /**
   * Active pack's STT capability. When false the Dialect mic is not rendered
   * (no usable speech model — see LanguagePack.capabilities) and a small hint
   * explains why; the English mic stays, since English STT is language-
   * independent.
   */
  dialectMicEnabled: boolean;
  /** Active dialect label for the hint copy, e.g. "Hokkien". */
  dialectLabel: string;
  onDialectPointerDown: () => void;
  onEnglishPointerDown: () => void;
  onMicPointerUp: (mode: MicMode) => void;
  onMicPointerLeave: (mode: MicMode) => void;
  /**
   * Keyboard/AT activation (Enter/Space synthesizes a click with detail 0,
   * never pointer events): toggle — start armed as a tap, next activation
   * stops. Pointer-gesture clicks (detail >= 1) never reach this.
   */
  onMicKeyboardToggle: (mode: MicMode) => void;
  onOpenTyping: () => void;
}

export function ActionBar({
  listeningMode,
  isTapMode,
  isListening,
  dialectMicEnabled,
  dialectLabel,
  onDialectPointerDown,
  onEnglishPointerDown,
  onMicPointerUp,
  onMicPointerLeave,
  onMicKeyboardToggle,
  onOpenTyping,
}: ActionBarProps) {
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 select-none">
      {!dialectMicEnabled && (
        <span className="px-3 py-1 rounded-full bg-zinc-800/80 text-white text-[11px] font-medium shadow-md whitespace-nowrap">
          Voice input coming soon for {dialectLabel}
        </span>
      )}
      <div className="flex gap-3 items-center">
        {dialectMicEnabled && (
          <button
            data-tour="chat-dialect-mic"
            onPointerDown={onDialectPointerDown}
            onPointerUp={() => onMicPointerUp("cantonese")}
            onPointerLeave={() => onMicPointerLeave("cantonese")}
            onClick={(e) => {
              if (e.detail === 0) onMicKeyboardToggle("cantonese");
            }}
            onContextMenu={(e) => e.preventDefault()}
            disabled={isListening && listeningMode !== "cantonese"}
            className={`relative flex items-center justify-center gap-2 w-[7.5rem] py-3 rounded-full text-white shadow-lg transition-transform active:scale-95 disabled:opacity-50 select-none ${listeningMode === "cantonese" ? "bg-brand-red shadow-brand-red/30 scale-105" : "bg-brand-red shadow-brand-red/20"}`}
          >
            {listeningMode === "cantonese" && (
              <span className="absolute inset-0 rounded-full bg-brand-red/60 animate-ping opacity-75" />
            )}
            {listeningMode === "cantonese" && isTapMode ? (
              <Square size={16} fill="currentColor" className="relative z-10" />
            ) : (
              <Mic size={18} className="relative z-10" />
            )}
            <span className="relative z-10 text-sm font-bold">Dialect</span>
          </button>
        )}

        <button
          data-tour="chat-type-button"
          onClick={onOpenTyping}
          disabled={isListening}
          className="flex items-center gap-2 px-5 py-3 rounded-full bg-card border-2 border-border text-muted-foreground shadow-lg shadow-border-subtle transition-transform active:scale-95 disabled:opacity-50 select-none"
        >
          <Keyboard size={18} />
          <span className="text-sm font-bold">Type</span>
        </button>

        <button
          data-tour="chat-english-mic"
          onPointerDown={onEnglishPointerDown}
          onPointerUp={() => onMicPointerUp("english")}
          onPointerLeave={() => onMicPointerLeave("english")}
          onClick={(e) => {
            if (e.detail === 0) onMicKeyboardToggle("english");
          }}
          onContextMenu={(e) => e.preventDefault()}
          disabled={isListening && listeningMode !== "english"}
          className={`relative flex items-center justify-center gap-2 w-[7.5rem] py-3 rounded-full text-white shadow-lg transition-transform active:scale-95 disabled:opacity-50 select-none ${listeningMode === "english" ? "bg-brand-red shadow-brand-red/20 scale-105" : "bg-brand-blue shadow-brand-blue/20"}`}
        >
          {listeningMode === "english" && (
            <span className="absolute inset-0 rounded-full bg-brand-red/60 animate-ping opacity-75" />
          )}
          {listeningMode === "english" && isTapMode ? (
            <Square size={16} fill="currentColor" className="relative z-10" />
          ) : (
            <Mic size={18} className="relative z-10" />
          )}
          <span className="relative z-10 text-sm font-bold">Non-Dialect</span>
        </button>
      </div>
    </div>
  );
}
