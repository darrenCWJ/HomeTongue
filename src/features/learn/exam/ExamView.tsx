import { useState, useRef } from "react";
import { ArrowLeft, X, Loader2, Mic, MicOff, Trophy } from "lucide-react";
import { useAudioRecorder } from "../../../hooks/audio";
import {
  transcribeCantonese,
  transcribeAnyLanguage,
  scoreCantoneseAccuracy,
} from "../../../services/translationService";
import { recordSpeechSample, consentFromProfile } from "../../../services/speechSampleService";
import { useProfile } from "../../../app/context/ProfileProvider";
import { motion } from "motion/react";
import { toast } from "sonner";
import type { ConversationLesson } from "../../../types";
import { PlayButtonDark } from "../shared";

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
  const [transcribed, setTranscribed] = useState<string | null>(null);
  const [finalScore, setFinalScore] = useState<number | null>(null);

  const { userProfile } = useProfile();
  const { startRecording, stopRecording } = useAudioRecorder();
  const current = vocab[index];
  const recordingStartRef = useRef<number | null>(null);
  const recordingTriggerRef = useRef<"tap" | "hold" | null>(null);
  const HOLD_THRESHOLD_MS = 300;

  const startListening = async () => {
    try {
      await startRecording();
      recordingStartRef.current = Date.now();
      setIsRecording(true);
    } catch {
      toast.error("Microphone access denied.");
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
      let result = await transcribeCantonese(blob);
      if (!result || result.trim().length === 0) {
        result = await transcribeAnyLanguage(blob);
      }
      if (!result || result.trim().length === 0) {
        toast.error("Could not detect speech — please speak louder or closer to the mic.");
        return;
      }
      const score = await scoreCantoneseAccuracy(current.cantonese, result);
      // ML data capture (consent-gated, fire-and-forget — never blocks the exam)
      recordSpeechSample(
        { source: "exam", expectedText: current.cantonese, transcript: result, score, audioBlob: blob },
        consentFromProfile(userProfile)
      );
      setTranscribed(result);
      setItemScore(score);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Recording failed: ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMicPointerDown = async () => {
    if (isRecording && recordingTriggerRef.current === "tap") {
      stopListening();
      return;
    }
    await startListening();
  };

  const handleMicPointerUp = () => {
    if (!isRecording) return;
    const elapsed = recordingStartRef.current ? Date.now() - recordingStartRef.current : 999;
    if (elapsed < HOLD_THRESHOLD_MS) {
      recordingTriggerRef.current = "tap";
    } else {
      recordingTriggerRef.current = null;
      stopListening();
    }
  };

  const handleMicPointerLeave = () => {
    if (!isRecording || recordingTriggerRef.current === "tap") return;
    stopListening();
  };

  const handleRetry = () => {
    setItemScore(null);
    setTranscribed(null);
  };

  const handleNext = () => {
    const updatedScores = [...scores, itemScore ?? 0];
    if (index + 1 >= vocab.length) {
      const avg = Math.round(updatedScores.reduce((a, b) => a + b, 0) / updatedScores.length);
      setFinalScore(avg);
      setScores(updatedScores);
    } else {
      setScores(updatedScores);
      setIndex((i) => i + 1);
      setItemScore(null);
      setTranscribed(null);
    }
  };

  if (finalScore !== null) {
    const passed = finalScore >= 60;
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="absolute inset-0 bg-white z-30 flex flex-col items-center justify-center p-8 text-center"
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
        <h2 className="text-3xl font-extrabold text-zinc-800 mb-2">{finalScore}%</h2>
        <p className={`text-lg font-bold mb-1 ${passed ? "text-green-600" : "text-red-600"}`}>
          {passed ? "Passed!" : "Not quite"}
        </p>
        <p className="text-sm text-zinc-500 mb-8">
          {passed ? "Great job! This lesson is marked complete." : "You need 60% to pass. Keep practising!"}
        </p>
        <button
          onClick={() => onComplete(finalScore)}
          className="w-full max-w-xs py-3.5 bg-brand-blue/100 text-white font-bold rounded-2xl shadow hover:bg-brand-blue active:scale-95 transition-all"
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
      className="absolute inset-0 bg-zinc-50 z-30 flex flex-col"
    >
      <div className="flex items-center gap-3 p-4 bg-white/80 backdrop-blur-md border-b border-zinc-200 sticky top-0 z-30">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h2 className="font-bold text-lg text-zinc-800 leading-tight">Final Exam</h2>
          <p className="text-xs text-zinc-400">
            {index + 1} / {vocab.length}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 scrollbar-none pb-nav">
        <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2">
            Recite this phrase
          </p>
          <p className="text-2xl font-bold text-zinc-800 mb-1">{current.cantonese}</p>
          {current.pronunciation && (
            <p className="text-sm font-mono text-brand-blue/60 mb-3">{current.pronunciation}</p>
          )}
          <p className="text-sm text-zinc-500 italic">{current.english}</p>
          <div className="mt-4">
            <PlayButtonDark text={current.cantonese} disabled={isRecording || isProcessing} />
          </div>
        </div>

        {itemScore === null ? (
          <div className="flex flex-col items-center gap-4">
            {isProcessing ? (
              <div className="flex items-center gap-2 text-zinc-500">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-sm">Analysing your speech…</span>
              </div>
            ) : (
              <>
                <button
                  onPointerDown={handleMicPointerDown}
                  onPointerUp={handleMicPointerUp}
                  onPointerLeave={handleMicPointerLeave}
                  onContextMenu={(e) => e.preventDefault()}
                  className={`relative flex items-center justify-center w-24 h-24 rounded-full text-white shadow-xl transition-transform active:scale-95 select-none ${isRecording ? "bg-red-500 shadow-red-200 scale-105" : "bg-brand-blue shadow-brand-blue/20 hover:scale-105"}`}
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
                <p className="text-sm text-zinc-500">
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
                <span
                  className={`text-4xl font-extrabold ${itemScore >= 60 ? "text-green-600" : "text-orange-500"}`}
                >
                  {itemScore}%
                </span>
                <span
                  className={`text-sm font-semibold ${itemScore >= 60 ? "text-green-700" : "text-orange-600"}`}
                >
                  {itemScore >= 60 ? "Well done!" : "Not quite"}
                </span>
              </div>
              <div className="w-full h-px bg-black/5" />
              <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-semibold text-zinc-400 w-16 pt-0.5 shrink-0">Expected</span>
                  <span className="font-bold text-zinc-700">{current.cantonese}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs font-semibold text-zinc-400 w-16 pt-0.5 shrink-0">You said</span>
                  <span className="font-bold">
                    {transcribed
                      ? (() => {
                          const punct = /[，。！？、；：""''（）\s!?.,;:'"…—–]/;
                          const expectedClean = [...current.cantonese].filter((c) => !punct.test(c));
                          const transcribedFull = [...transcribed];
                          const transcribedClean = transcribedFull.filter((c) => !punct.test(c));
                          // LCS to find best alignment, so missing/extra chars don't shift all subsequent matches
                          const m = expectedClean.length,
                            n = transcribedClean.length;
                          const dp: number[][] = Array.from({ length: m + 1 }, () =>
                            new Array(n + 1).fill(0)
                          );
                          for (let r = 1; r <= m; r++)
                            for (let c = 1; c <= n; c++)
                              dp[r][c] =
                                expectedClean[r - 1] === transcribedClean[c - 1]
                                  ? dp[r - 1][c - 1] + 1
                                  : Math.max(dp[r - 1][c], dp[r][c - 1]);
                          const matched = new Set<number>();
                          let r = m,
                            c = n;
                          while (r > 0 && c > 0) {
                            if (expectedClean[r - 1] === transcribedClean[c - 1]) {
                              matched.add(c - 1);
                              r--;
                              c--;
                            } else if (dp[r - 1][c] >= dp[r][c - 1]) r--;
                            else c--;
                          }
                          let cleanPos = 0;
                          return transcribedFull.map((char, ci) => {
                            if (punct.test(char))
                              return (
                                <span key={ci} className="text-zinc-700">
                                  {char}
                                </span>
                              );
                            const isMatch = matched.has(cleanPos++);
                            return (
                              <span key={ci} className={isMatch ? "text-green-600" : "text-orange-600"}>
                                {char}
                              </span>
                            );
                          });
                        })()
                      : "—"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleRetry}
                className="flex-1 py-3 rounded-2xl border border-zinc-200 text-zinc-600 font-semibold text-sm hover:bg-zinc-50 active:scale-95 transition-all"
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
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-brand-blue/100" : i < index ? "w-2 bg-brand-blue/20" : "w-2 bg-zinc-200"}`}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
