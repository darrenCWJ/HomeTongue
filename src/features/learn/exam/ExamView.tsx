import {
  useState,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ArrowLeft, X, Loader2, Mic, MicOff, Trophy } from "lucide-react";
import { useAudioRecorder } from "../../../hooks/audio";
import {
  transcribeDialect,
  transcribeAnyLanguage,
  scoreDialectAccuracyDetailed,
  type ScoreMethod,
} from "../../../services/translationService";
import { recordSpeechSample, consentFromProfile } from "../../../services/speechSampleService";
import { useProfile } from "../../../app/context/ProfileProvider";
import { useActiveCapabilities, useActiveLanguagePack } from "../../../hooks/useActiveLanguageCode";
import { motion } from "motion/react";
import { toast } from "sonner";
import type { ConversationLesson } from "../../../types";
import { PlayButtonDark } from "../shared";
import { TranscriptDiff } from "./TranscriptDiff";

// Honest framing shared by the per-item card and the final screen: the score
// measures transcribed WORD accuracy (the STT model auto-corrects tones).
const WORD_ACCURACY_EXPLAINER = "Measures whether you said the right words — tone coaching is coming.";

function FallbackHint() {
  return <p className="text-[10px] text-faint italic">Approximate — offline scoring</p>;
}

// ─── ExamView ─────────────────────────────────────────────────────────────────

export function ExamView({
  lesson,
  onBack,
  onComplete,
}: {
  lesson: ConversationLesson;
  onBack: () => void;
  onComplete: (score: number) => void;
}) {
  const vocab = lesson.vocabulary;
  const [index, setIndex] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [itemScore, setItemScore] = useState<number | null>(null);
  const [itemMethod, setItemMethod] = useState<ScoreMethod | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [transcribed, setTranscribed] = useState<string | null>(null);
  const [finalScore, setFinalScore] = useState<number | null>(null);

  const { userProfile } = useProfile();
  // Reactive capability gate: packs without a usable STT model (e.g. a
  // Hokkien session converted to a conversation lesson) cannot take a
  // voice-scored exam — hide the mic and explain instead of a broken flow.
  const { stt: sttEnabled } = useActiveCapabilities();
  const packLabel = useActiveLanguagePack().label;
  const { startRecording, stopRecording } = useAudioRecorder();
  const current = vocab[index];
  const recordingStartRef = useRef<number | null>(null);
  // "tap" means an armed recording the user is no longer holding; null means a
  // hold in progress (or nothing armed). There is no "hold" member on purpose —
  // the null branch is what every hold check reads.
  const recordingTriggerRef = useRef<"tap" | null>(null);
  // A release that lands while getUserMedia is still pending has no recorder
  // to stop yet. It used to be dropped, so the prompt resolved into a hot mic
  // nobody was holding and the next tap restarted it, discarding the audio.
  const releasedDuringStartRef = useRef(false);
  // Set synchronously, before the first await, so a second press landing in the
  // same prompt window is ignored rather than stacking another start. Without
  // it the two presses shared one release flag: the first start consumed what
  // was really the second press's release, and the second armed a recorder
  // nobody was holding — and a tap could not stop it, since the trigger ref
  // reads as a hold. (Mirrors useMicRecording's synchronous ownership ref.)
  const isStartingRef = useRef(false);
  const HOLD_THRESHOLD_MS = 300;

  const startListening = async () => {
    isStartingRef.current = true;
    releasedDuringStartRef.current = false;
    try {
      await startRecording();
    } catch {
      isStartingRef.current = false;
      toast.error("Microphone access denied.");
      return;
    }
    isStartingRef.current = false;
    recordingStartRef.current = Date.now();
    setIsRecording(true);
    if (releasedDuringStartRef.current) {
      releasedDuringStartRef.current = false;
      // The hold ended before the mic came up — complete it now (the elapsed
      // check in stopListening reports the too-short recording honestly).
      await stopListening();
    }
  };

  const stopListening = async () => {
    recordingTriggerRef.current = null;
    setIsRecording(false);

    const elapsed = recordingStartRef.current ? Date.now() - recordingStartRef.current : 0;
    recordingStartRef.current = null;

    if (elapsed < 1000) {
      stopRecording().catch(() => {});
      toast.error("Recording too short — please record for at least 1 second.");
      return;
    }

    setIsProcessing(true);
    try {
      const blob = await stopRecording();
      if (blob.size === 0) {
        toast.error("No audio captured — please try again.");
        return;
      }
      let result = await transcribeDialect(blob);
      if (!result || result.trim().length === 0) {
        result = await transcribeAnyLanguage(blob);
      }
      if (!result || result.trim().length === 0) {
        toast.error("Could not detect speech — please speak louder or closer to the mic.");
        return;
      }
      const { score, method } = await scoreDialectAccuracyDetailed(current.dialect, result);
      // ML data capture (consent-gated, fire-and-forget — never blocks the exam)
      recordSpeechSample(
        { source: "exam", expectedText: current.dialect, transcript: result, score, audioBlob: blob },
        consentFromProfile(userProfile)
      );
      setTranscribed(result);
      setItemScore(score);
      setItemMethod(method);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Recording failed: ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMicPointerDown = async (e: ReactPointerEvent<HTMLButtonElement>) => {
    // Capture the pointer so the release lands on this button from wherever
    // the finger has drifted. Without it, sliding off during the permission
    // prompt and lifting elsewhere fired pointerup somewhere else entirely:
    // the release flag stayed unset and the resolved start armed a recording
    // nobody was holding. Touch already behaves this way (implicit capture);
    // this extends it to mouse. Capture also suppresses boundary events while
    // held (verified in Chromium), so a drag off an ARMED hold now records
    // until the release instead of stopping at the boundary crossing — as it
    // always did on touch, and the leave path processed the recording exactly
    // like a release anyway, so nothing is discarded either way.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // jsdom implements no pointer capture; the leave/cancel paths still run.
    }
    if (isRecording && recordingTriggerRef.current === "tap") {
      stopListening();
      return;
    }
    // A start already waiting on the mic owns this press.
    if (isStartingRef.current) return;
    await startListening();
  };

  const handleMicPointerUp = () => {
    if (!isRecording) {
      // Nothing is armed yet: a start is still waiting on the mic (the start
      // path completes the hold for us), or this is the captured release of a
      // press whose recording already stopped (a tap, a cancelled hold) — a
      // stale flag is harmless there, the next start resets it.
      releasedDuringStartRef.current = true;
      return;
    }
    const elapsed = recordingStartRef.current ? Date.now() - recordingStartRef.current : 999;
    if (elapsed < HOLD_THRESHOLD_MS) {
      recordingTriggerRef.current = "tap";
    } else {
      recordingTriggerRef.current = null;
      stopListening();
    }
  };

  // With the pointer captured this fires only once the gesture is over (losing
  // capture replays the boundary crossing), but it still ends an armed hold
  // wherever capture is not in effect. The start-time check makes it a no-op
  // right after the cancel handler has stopped the hold — isRecording is that
  // render's stale closure there, and a second stopListening would report a
  // spurious "too short" on a recording that was already processed.
  const handleMicPointerLeave = () => {
    if (!isRecording || recordingTriggerRef.current === "tap") return;
    if (recordingStartRef.current === null) return;
    stopListening();
  };

  // The browser took the gesture away (a touch slide becoming a scroll, palm
  // rejection, an app switch): pointerup will never fire, even captured.
  const handleMicPointerCancel = () => {
    if (!isRecording) {
      // The start is still waiting on the mic — complete the hold when it
      // arms, exactly as a release would.
      releasedDuringStartRef.current = true;
      return;
    }
    if (recordingTriggerRef.current === "tap") return; // tap mode holds no gesture
    if (recordingStartRef.current === null) return; // already stopped this tick
    stopListening();
  };

  // Keyboard/AT path. Enter/Space on a native button synthesizes a click
  // (detail 0), never pointer events, so the handlers above never run for a
  // keyboard user. Toggle with tap semantics: start and arm as a tap, the
  // next activation stops. The click trailing a real pointer gesture carries
  // detail >= 1 and is ignored — its pointerdown/up already ran.
  const handleMicClick = async (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (e.detail !== 0) return;
    if (isRecording) {
      stopListening();
      return;
    }
    if (isStartingRef.current) {
      // A start is still waiting on the mic — complete-and-stop it when it
      // arms, exactly as a pointer release during the prompt would.
      releasedDuringStartRef.current = true;
      return;
    }
    await startListening();
    // Arm as a tap only once the mic actually armed: a denied start must not
    // leave a stale tap trigger, which would make pointer-leave ignore the
    // next hold's drag-off and leave that recording running.
    if (recordingStartRef.current !== null) {
      recordingTriggerRef.current = "tap";
    }
  };

  const handleRetry = () => {
    setItemScore(null);
    setItemMethod(null);
    setTranscribed(null);
  };

  const handleNext = () => {
    // Only committed scores mark the final result approximate — a retried
    // item's discarded fallback score should not flag an all-LLM average.
    if (itemMethod === "fallback") setUsedFallback(true);
    const updatedScores = [...scores, itemScore ?? 0];
    if (index + 1 >= vocab.length) {
      const avg = Math.round(updatedScores.reduce((a, b) => a + b, 0) / updatedScores.length);
      setFinalScore(avg);
      setScores(updatedScores);
    } else {
      setScores(updatedScores);
      setIndex((i) => i + 1);
      setItemScore(null);
      setItemMethod(null);
      setTranscribed(null);
    }
  };

  if (finalScore !== null) {
    const passed = finalScore >= 60;
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="absolute inset-0 bg-card z-30 flex flex-col items-center justify-center p-8 text-center"
      >
        <div
          className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 ${passed ? "bg-green-100" : "bg-red-100"}`}
        >
          {passed ? (
            <Trophy size={48} className="text-green-500" />
          ) : (
            <X size={48} className="text-red-500" />
          )}
        </div>
        <h2 className="text-3xl font-extrabold text-foreground mb-1">{finalScore}%</h2>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-faint mb-2">Word accuracy</p>
        <p className={`text-lg font-bold mb-1 ${passed ? "text-green-600" : "text-red-600"}`}>
          {passed ? "Passed!" : "Not quite"}
        </p>
        <p className="text-sm text-muted-foreground mb-2">
          {passed ? "Great job! This lesson is marked complete." : "You need 60% to pass. Keep practising!"}
        </p>
        <p className="text-[11px] text-faint mb-1">{WORD_ACCURACY_EXPLAINER}</p>
        {usedFallback && <FallbackHint />}
        <button
          onClick={() => onComplete(finalScore)}
          className="w-full max-w-xs mt-7 py-3.5 bg-brand-blue/100 text-white font-bold rounded-2xl shadow hover:bg-brand-blue active:scale-95 transition-all"
        >
          Back to Lesson
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      className="absolute inset-0 bg-background z-30 flex flex-col"
    >
      <div className="flex items-center gap-3 p-4 bg-card/80 backdrop-blur-md border-b border-border sticky top-0 z-30">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-muted-foreground hover:bg-muted rounded-full transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h2 className="font-bold text-lg text-foreground leading-tight">Final Exam</h2>
          <p className="text-xs text-faint">
            {index + 1} / {vocab.length}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 scrollbar-none pb-nav">
        <div className="bg-card rounded-3xl shadow-sm border border-border-subtle p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-faint mb-2">
            Recite this phrase
          </p>
          <p className="text-2xl font-bold text-foreground mb-1">{current.dialect}</p>
          {current.romanization && (
            <p className="text-sm font-mono text-brand-blue/60 mb-3">{current.romanization}</p>
          )}
          <p className="text-sm text-muted-foreground italic">{current.english}</p>
          <div className="mt-4">
            <PlayButtonDark text={current.dialect} disabled={isRecording || isProcessing} withSlow />
          </div>
        </div>

        {!sttEnabled ? (
          <div className="flex flex-col items-center gap-3 text-center px-4 py-6">
            <span className="px-3 py-1 rounded-full bg-zinc-800/80 text-white text-[11px] font-medium shadow-md whitespace-nowrap">
              Voice input coming soon for {packLabel}
            </span>
            <p className="text-sm text-muted-foreground max-w-xs">
              The exam is scored by listening to your speech, and {packLabel} speech recognition isn't
              available yet. Practise the phrases above and check back soon.
            </p>
          </div>
        ) : itemScore === null ? (
          <div className="flex flex-col items-center gap-4">
            {isProcessing ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-sm">Analysing your speech…</span>
              </div>
            ) : (
              <>
                <button
                  onPointerDown={handleMicPointerDown}
                  onPointerUp={handleMicPointerUp}
                  onPointerLeave={handleMicPointerLeave}
                  onPointerCancel={handleMicPointerCancel}
                  onClick={handleMicClick}
                  onContextMenu={(e) => e.preventDefault()}
                  aria-label={isRecording ? "Stop recording" : "Record your answer"}
                  className={`relative flex items-center justify-center w-24 h-24 rounded-full text-white shadow-xl transition-transform active:scale-95 select-none touch-none ${isRecording ? "bg-red-500 shadow-red-200 scale-105" : "bg-brand-blue shadow-brand-blue/20 hover:scale-105"}`}
                >
                  {isRecording && (
                    <span className="absolute w-full h-full rounded-full bg-red-400 animate-ping opacity-75" />
                  )}
                  {isRecording ? (
                    <MicOff size={36} className="relative z-10" />
                  ) : (
                    <Mic size={36} className="relative z-10" />
                  )}
                </button>
                <p className="text-sm text-muted-foreground">
                  {isRecording ? "Recording… tap to stop" : "Tap or hold to record"}
                </p>
              </>
            )}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-3"
          >
            <div
              className={`rounded-2xl p-5 flex flex-col gap-3 ${itemScore >= 60 ? "bg-green-50 border border-green-200" : "bg-orange-50 border border-orange-200"}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span
                    className={`text-4xl font-extrabold ${itemScore >= 60 ? "text-green-600" : "text-orange-500"}`}
                  >
                    {itemScore}%
                  </span>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-faint mt-0.5">
                    Word accuracy
                  </p>
                </div>
                <span
                  className={`text-sm font-semibold ${itemScore >= 60 ? "text-green-700" : "text-orange-600"}`}
                >
                  {itemScore >= 60 ? "Well done!" : "Not quite"}
                </span>
              </div>
              <div className="w-full h-px bg-black/5" />
              <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-semibold text-faint w-16 pt-0.5 shrink-0">Expected</span>
                  <span className="font-bold text-foreground/90">{current.dialect}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs font-semibold text-faint w-16 pt-0.5 shrink-0">You said</span>
                  <span className="font-bold">
                    {transcribed ? (
                      <TranscriptDiff expected={current.dialect} transcribed={transcribed} />
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="text-[11px] text-faint leading-snug">{WORD_ACCURACY_EXPLAINER}</p>
                {itemMethod === "fallback" && <FallbackHint />}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleRetry}
                className="flex-1 py-3 rounded-2xl border border-border text-muted-foreground font-semibold text-sm hover:bg-background active:scale-95 transition-all"
              >
                Try Again
              </button>
              <button
                onClick={handleNext}
                className="flex-1 py-3 bg-brand-blue/100 text-white font-bold rounded-2xl shadow hover:bg-brand-blue active:scale-95 transition-all text-sm"
              >
                {index + 1 >= vocab.length ? "See Results" : "Next →"}
              </button>
            </div>
          </motion.div>
        )}

        <div className="flex gap-1.5 justify-center">
          {vocab.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-brand-blue/100" : i < index ? "w-2 bg-brand-blue/20" : "w-2 bg-secondary"}`}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
