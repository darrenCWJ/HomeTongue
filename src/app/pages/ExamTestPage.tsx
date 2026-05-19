import React, { useState, useRef } from "react";
import { ArrowLeft, Mic, MicOff, Loader2, Volume2, Trophy, X } from "lucide-react";
import { Toaster, toast } from "sonner";
import { useAppContext } from "../context/AppContext";
import { useAudioRecorder } from "../../hooks/useElevenLabs";
import { speakText, GOOGLE_TTS_VOICES, DEFAULT_VOICE } from "../../hooks/useGoogleTTS";
import type { VoiceKey } from "../../hooks/useGoogleTTS";
import { transcribeWithModel, scoreCantoneseAccuracy } from "../../services/translationService";
import type { ConversationLesson } from "../../types";

const MODELS = [
  { id: "whisper-1", label: "Whisper-1" },
  { id: "gpt-4o-transcribe", label: "GPT-4o Transcribe" },
  { id: "gpt-4o-mini-transcribe", label: "GPT-4o Mini Transcribe" },
  { id: "gpt-4o-transcribe-diarize", label: "GPT-4o Diarize" },
];

const LANGUAGES = [
  { id: "zh", label: "zh (Chinese + prompt bias)" },
  { id: "yue", label: "yue (Cantonese native)" },
];

function safeVoiceKey(id: string | undefined): VoiceKey {
  if (id && id in GOOGLE_TTS_VOICES) return id as VoiceKey;
  return DEFAULT_VOICE;
}

function PlayButton({ text }: { text: string }) {
  const { userProfile } = useAppContext();
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) return;
    setIsPlaying(true);
    try {
      await speakText(text, safeVoiceKey(userProfile?.preferredVoiceId));
    } catch (err) {
      toast.error(`Audio failed: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setIsPlaying(false);
    }
  };

  return (
    <button
      onClick={handlePlay}
      disabled={isPlaying}
      className="w-9 h-9 rounded-full bg-brand-blue/15 hover:bg-brand-blue/20 text-brand-blue flex items-center justify-center transition-colors flex-shrink-0"
    >
      {isPlaying ? <Loader2 size={16} className="animate-spin" /> : <Volume2 size={16} />}
    </button>
  );
}

class ExamErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: Error) { return { error: err.message }; }
  render() {
    if (this.state.error) return (
      <div className="min-h-screen bg-zinc-50 p-6">
        <h1 className="text-xl font-bold text-red-600 mb-2">Error</h1>
        <p className="text-sm text-zinc-700 font-mono">{this.state.error}</p>
      </div>
    );
    return this.props.children;
  }
}

export function ExamTestPage() {
  return (
    <ExamErrorBoundary>
      <ExamTestPageInner />
    </ExamErrorBoundary>
  );
}

function ExamTestPageInner() {
  const { conversationLessons } = useAppContext();
  const [selectedLesson, setSelectedLesson] = useState<ConversationLesson | null>(null);
  const [model, setModel] = useState(MODELS[0].id);
  const [language, setLanguage] = useState(LANGUAGES[0].id);

  if (!selectedLesson) {
    return (
      <div className="min-h-screen bg-zinc-50 p-6">
        <Toaster position="top-center" richColors />
        <h1 className="text-2xl font-bold text-zinc-800 mb-1">Exam Model Test</h1>
        <p className="text-sm text-zinc-500 mb-6">Hidden test page — compare transcription models</p>

        <div className="grid gap-3 mb-6">
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-800"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>

          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Language Hint</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-800"
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        </div>

        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">Select a Conversation Lesson</h2>
        {conversationLessons.length === 0 ? (
          <p className="text-sm text-zinc-400">No conversation lessons yet. Create one from the Learn page first.</p>
        ) : (
          <div className="grid gap-2">
            {conversationLessons.map((lesson) => (
              <button
                key={lesson.id}
                onClick={() => setSelectedLesson(lesson)}
                className="w-full text-left p-4 bg-white border border-zinc-200 rounded-xl hover:border-brand-blue/50 transition-colors"
              >
                <p className="font-semibold text-zinc-800">{lesson.title}</p>
                <p className="text-xs text-zinc-400">{lesson.vocabulary.length} phrases</p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <ExamRunner
      lesson={selectedLesson}
      model={model}
      language={language}
      onBack={() => setSelectedLesson(null)}
    />
  );
}

function ExamRunner({
  lesson,
  model,
  language,
  onBack,
}: {
  lesson: ConversationLesson;
  model: string;
  language: string;
  onBack: () => void;
}) {
  const vocab = lesson.vocabulary;
  const [index, setIndex] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [itemScore, setItemScore] = useState<number | null>(null);
  const [transcribed, setTranscribed] = useState<string | null>(null);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

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
    setLastError(null);
    try {
      const blob = await stopRecording();
      if (blob.size === 0) {
        setLastError("No audio captured — please try again.");
        toast.error("No audio captured — please try again.");
        return;
      }
      const result = await transcribeWithModel(blob, model, language);
      if (!result || result.trim().length === 0) {
        setLastError("Could not detect speech — please speak louder or closer to the mic.");
        toast.error("Could not detect speech — please speak louder or closer to the mic.");
        return;
      }
      const score = await scoreCantoneseAccuracy(current.cantonese, result);
      setTranscribed(result);
      setItemScore(score);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setLastError(msg);
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

  const handleRetry = () => { setItemScore(null); setTranscribed(null); };

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

  const modelLabel = MODELS.find((m) => m.id === model)?.label ?? model;
  const langLabel = LANGUAGES.find((l) => l.id === language)?.label ?? language;

  if (finalScore !== null) {
    const passed = finalScore >= 60;
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 ${passed ? "bg-green-100" : "bg-red-100"}`}>
          {passed ? <Trophy size={48} className="text-green-500" /> : <X size={48} className="text-red-500" />}
        </div>
        <h2 className="text-3xl font-extrabold text-zinc-800 mb-2">{finalScore}%</h2>
        <p className={`text-lg font-bold mb-1 ${passed ? "text-green-600" : "text-red-600"}`}>
          {passed ? "Passed!" : "Not quite"}
        </p>
        <div className="text-xs text-zinc-400 mb-6 space-y-1">
          <p>Model: <span className="font-semibold text-zinc-600">{modelLabel}</span></p>
          <p>Language: <span className="font-semibold text-zinc-600">{langLabel}</span></p>
        </div>
        <button
          onClick={onBack}
          className="w-full max-w-xs py-3.5 bg-brand-blue/100 text-white font-bold rounded-2xl shadow hover:bg-brand-blue active:scale-95 transition-all"
        >
          Back to Setup
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      <Toaster position="top-center" richColors />
      <div className="flex items-center gap-3 p-4 bg-white/80 backdrop-blur-md border-b border-zinc-200 sticky top-0 z-30">
        <button onClick={onBack} className="p-2 -ml-2 text-zinc-600 hover:bg-zinc-100 rounded-full transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h2 className="font-bold text-lg text-zinc-800 leading-tight">Exam Test</h2>
          <p className="text-xs text-zinc-400">{index + 1} / {vocab.length} — {modelLabel} · {language}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
        <div className="bg-white rounded-3xl shadow-sm border border-zinc-100 p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2">Recite this phrase</p>
          <p className="text-2xl font-bold text-zinc-800 mb-1">{current.cantonese}</p>
          {current.pronunciation && (
            <p className="text-sm font-mono text-brand-blue/60 mb-3">{current.pronunciation}</p>
          )}
          <p className="text-sm text-zinc-500 italic">{current.english}</p>
          <div className="mt-4">
            <PlayButton text={current.cantonese} />
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
                  {isRecording
                    ? <MicOff size={36} className="relative z-10" />
                    : <Mic size={36} className="relative z-10" />}
                </button>
                <p className="text-sm text-zinc-500">
                  {isRecording ? "Recording… tap to stop" : "Tap or hold to record"}
                </p>
                {lastError && (
                  <p className="text-sm text-red-500 mt-2 text-center px-4">{lastError}</p>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className={`rounded-2xl p-5 flex flex-col gap-3 ${itemScore >= 60 ? "bg-green-50 border border-green-200" : "bg-orange-50 border border-orange-200"}`}>
              <div className="flex items-center justify-between">
                <span className={`text-4xl font-extrabold ${itemScore >= 60 ? "text-green-600" : "text-orange-500"}`}>{itemScore}%</span>
                <span className={`text-sm font-semibold ${itemScore >= 60 ? "text-green-700" : "text-orange-600"}`}>
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
                    {transcribed ? (
                      (() => {
                        const punct = /[，。！？、；：“”‘’（）\s]/;
                        const expectedChars = [...current.cantonese].filter(c => !punct.test(c));
                        return [...transcribed].map((char, ci) => {
                          if (punct.test(char)) return <span key={ci} className="text-zinc-700">{char}</span>;
                          const cleanIdx = [...transcribed.slice(0, ci)].filter(c => !punct.test(c)).length;
                          const isMatch = cleanIdx < expectedChars.length && char === expectedChars[cleanIdx];
                          return <span key={ci} className={isMatch ? "text-green-600" : "text-orange-600"}>{char}</span>;
                        });
                      })()
                    ) : "—"}
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
          </div>
        )}
      </div>
    </div>
  );
}
