import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Mic, MicOff, Send, Target } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useProfile } from "../../../app/context/ProfileProvider";
import { useActiveLanguagePack } from "../../../hooks/useActiveLanguageCode";
import { useAudioRecorder } from "../../../hooks/audio";
import { speakText, asVoiceKey } from "../../../hooks/useGoogleTTS";
import { transcribeDialect, transcribeAnyLanguage } from "../../../services/translationService";
import {
  nextBotTurn,
  coachUserTurn,
  toHistory,
  type RoleplayLine,
  type RoleplayScenario,
  type RoleplayTurn,
} from "../../../services/roleplayService";
import { newId } from "../../../utils/id";
import { RoleplayBubble } from "./RoleplayBubble";
import { RoleplaySummary } from "./RoleplaySummary";

const MIN_RECORDING_MS = 1000;

interface RoleplayViewProps {
  scenario: RoleplayScenario;
  onBack: () => void;
}

export function RoleplayView({ scenario, onBack }: RoleplayViewProps) {
  const { userProfile } = useProfile();
  // Voice-less packs (capabilities tts/stt false, e.g. nan-TW) rehearse by
  // TYPING: the mic button is hidden and bot lines are not auto-spoken
  // (speakText would no-op anyway; skipping keeps intent explicit).
  const { label: languageLabel, capabilities } = useActiveLanguagePack();
  const { startRecording, stopRecording } = useAudioRecorder();

  const [turns, setTurns] = useState<RoleplayTurn[]>([]);
  const [textDraft, setTextDraft] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isBotThinking, setIsBotThinking] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);

  const openedRef = useRef(false);
  const recordingStartRef = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const voiceIdRef = useRef(userProfile?.preferredVoiceId);
  voiceIdRef.current = userProfile?.preferredVoiceId;

  // Synchronous mirror of `turns`: async callbacks (coach feedback landing
  // mid-transcription, bot replies) must never overwrite each other with a
  // stale render closure, so every mutation goes through applyTurns.
  const turnsRef = useRef<RoleplayTurn[]>([]);
  const applyTurns = (updater: (prev: RoleplayTurn[]) => RoleplayTurn[]) => {
    turnsRef.current = updater(turnsRef.current);
    setTurns(turnsRef.current);
  };

  const speakLine = (dialectText: string) => {
    if (!capabilities.tts) return;
    speakText(dialectText, asVoiceKey(voiceIdRef.current)).catch(() => {
      // Auto-play is best-effort; the bubble's play button remains available.
    });
  };

  // Seed the scripted opening line once (ref guard survives StrictMode remounts).
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    const opening: RoleplayTurn = {
      id: newId(),
      speaker: "bot",
      text: scenario.opening.dialect,
      romanization: scenario.opening.romanization,
      english: scenario.opening.english,
    };
    applyTurns((prev) => (prev.length > 0 ? prev : [opening]));
    speakLine(opening.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length, isBotThinking]);

  const appendBotLine = (line: RoleplayLine) => {
    const botTurn: RoleplayTurn = {
      id: newId(),
      speaker: "bot",
      text: line.dialect,
      romanization: line.romanization,
      english: line.english,
    };
    applyTurns((prev) => [...prev, botTurn]);
    speakLine(botTurn.text);
  };

  const sendUserReply = (rawText: string) => {
    const text = rawText.trim();
    if (!text || isBotThinking) return;

    const userTurn: RoleplayTurn = {
      id: newId(),
      speaker: "user",
      text,
      isCoachPending: true,
    };
    const lastBotLine =
      [...turnsRef.current].reverse().find((t) => t.speaker === "bot")?.text ?? scenario.opening.dialect;
    applyTurns((prev) => [...prev, userTurn]);
    const history = toHistory(turnsRef.current);

    // Coach feedback (fire-and-forget; null → chip quietly disappears)
    coachUserTurn(scenario, lastBotLine, text)
      .then((feedback) => {
        applyTurns((prev) =>
          prev.map((t) =>
            t.id === userTurn.id ? { ...t, coach: feedback ?? undefined, isCoachPending: false } : t
          )
        );
      })
      .catch(() => {
        applyTurns((prev) => prev.map((t) => (t.id === userTurn.id ? { ...t, isCoachPending: false } : t)));
      });

    // Counterpart's next line
    setIsBotThinking(true);
    nextBotTurn(scenario, history)
      .then((line) => {
        if (line) {
          appendBotLine(line);
        } else {
          toast.error("Couldn't get a reply — please try again.");
        }
      })
      .finally(() => setIsBotThinking(false));
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const draft = textDraft;
    setTextDraft("");
    sendUserReply(draft);
  };

  const handleMicClick = async () => {
    if (isTranscribing || isBotThinking) return;

    if (!isRecording) {
      try {
        await startRecording();
        recordingStartRef.current = Date.now();
        setIsRecording(true);
      } catch {
        toast.error("Microphone access denied.");
      }
      return;
    }

    setIsRecording(false);
    const elapsed = recordingStartRef.current ? Date.now() - recordingStartRef.current : 0;
    recordingStartRef.current = null;
    if (elapsed < MIN_RECORDING_MS) {
      stopRecording().catch(() => {});
      toast.error("Recording too short — please record for at least 1 second.");
      return;
    }

    setIsTranscribing(true);
    try {
      const blob = await stopRecording();
      if (blob.size === 0) {
        toast.error("No audio captured — please try again.");
        return;
      }
      let transcript = await transcribeDialect(blob);
      if (!transcript || transcript.trim().length === 0) {
        transcript = await transcribeAnyLanguage(blob);
      }
      if (!transcript || transcript.trim().length === 0) {
        toast.error("Could not detect speech — please speak louder or closer to the mic.");
        return;
      }
      sendUserReply(transcript);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Recording failed: ${msg}`);
    } finally {
      setIsTranscribing(false);
    }
  };

  const isInputDisabled = isBotThinking || isTranscribing;

  return (
    <motion.div
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      className="absolute inset-0 bg-zinc-50 z-30 flex flex-col"
    >
      <div className="flex items-center gap-3 p-4 bg-white/80 backdrop-blur-md border-b border-zinc-200 sticky top-0 z-30">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg text-zinc-800 leading-tight truncate">
            {scenario.emoji} {scenario.title}
          </h2>
          <p className="text-xs text-zinc-400 truncate">{scenario.subtitle}</p>
        </div>
        {!isSummaryOpen && (
          <button
            onClick={() => setIsSummaryOpen(true)}
            className="text-xs font-bold text-brand-blue bg-brand-blue/10 hover:bg-brand-blue/20 rounded-full px-3 py-1.5 transition-colors flex-shrink-0"
          >
            End
          </button>
        )}
      </div>

      {isSummaryOpen ? (
        <RoleplaySummary
          scenario={scenario}
          turns={turns}
          onKeepPractising={() => setIsSummaryOpen(false)}
          onDone={onBack}
        />
      ) : (
        <>
          <div className="flex gap-1.5 px-4 py-2 overflow-x-auto scrollbar-none flex-shrink-0">
            {scenario.goalHints.map((hint) => (
              <span
                key={hint}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-500 bg-white border border-zinc-100 rounded-full px-2 py-1 whitespace-nowrap flex-shrink-0"
              >
                <Target size={10} className="text-brand-blue/60 flex-shrink-0" />
                {hint}
              </span>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-none">
            {turns.map((turn) => (
              <RoleplayBubble key={turn.id} turn={turn} />
            ))}
            {isBotThinking && (
              <div className="flex items-center gap-2 text-zinc-400 text-xs pl-10">
                <Loader2 size={14} className="animate-spin" />
                Thinking…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={handleTextSubmit}
            className="flex items-center gap-2 px-4 pt-2 bg-white border-t border-zinc-200 pb-nav flex-shrink-0"
          >
            {capabilities.stt && (
              <button
                type="button"
                onClick={handleMicClick}
                disabled={isTranscribing || isBotThinking}
                className={`relative w-11 h-11 rounded-full flex items-center justify-center text-white flex-shrink-0 transition-all active:scale-95 disabled:opacity-50 ${
                  isRecording ? "bg-red-500 shadow-red-200 shadow" : "bg-brand-blue shadow"
                }`}
              >
                {isRecording && (
                  <span className="absolute w-full h-full rounded-full bg-red-400 animate-ping opacity-60" />
                )}
                {isTranscribing ? (
                  <Loader2 size={18} className="animate-spin relative z-10" />
                ) : isRecording ? (
                  <MicOff size={18} className="relative z-10" />
                ) : (
                  <Mic size={18} className="relative z-10" />
                )}
              </button>
            )}
            <input
              type="text"
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              placeholder={
                isRecording ? "Recording… tap mic to stop" : `Reply in ${languageLabel} or English…`
              }
              disabled={isInputDisabled || isRecording}
              className="flex-1 min-w-0 bg-zinc-100 rounded-full px-4 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isInputDisabled || isRecording || textDraft.trim().length === 0}
              className="w-11 h-11 rounded-full bg-brand-blue text-white flex items-center justify-center flex-shrink-0 shadow transition-all active:scale-95 disabled:opacity-40"
            >
              <Send size={16} />
            </button>
          </form>
        </>
      )}
    </motion.div>
  );
}
