import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Globe2, Sparkles, ArrowRight, Volume2, Check, Loader2, Home, Briefcase } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { VOICES } from "../../constants/voices";
import { previewVoice } from "../../utils/voicePreviewCache";
import { WORK_JOB_TITLES, type WorkJobTitle, type PersonaType } from "../../types";

const PREVIEW_TEXT = "你好，好高興認識你！";

type Step = "name" | "voice" | "persona";
const STEPS: Step[] = ["name", "voice", "persona"];

export function OnboardingPage() {
  const { updateUserProfile } = useAppContext();
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [voiceId, setVoiceId] = useState(VOICES[0].id);
  const [voiceGenderTab, setVoiceGenderTab] = useState<"female" | "male">("female");
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<PersonaType>("personal");
  const [selectedJobTitle, setSelectedJobTitle] = useState<WorkJobTitle | null>(null);

  const stepIndex = STEPS.indexOf(step);

  const handlePreview = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (previewingId) return;
    setPreviewingId(id);
    try {
      await previewVoice(id, PREVIEW_TEXT);
    } catch {
      // ignore preview errors
    } finally {
      setPreviewingId(null);
    }
  };

  const handleNameNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setStep("voice");
  };

  const handleVoiceNext = () => {
    setStep("persona");
  };

  const handleFinish = () => {
    const updates: Parameters<typeof updateUserProfile>[0] = {
      name: name.trim(),
      preferredVoiceId: voiceId,
      activePersona: selectedPersona,
    };
    if (selectedPersona === "work" && selectedJobTitle) {
      updates.personaProfiles = {
        work: { tone: "formal", jobTitle: selectedJobTitle },
      };
    }
    updateUserProfile(updates);
  };

  return (
    <div className="flex flex-col h-full bg-white relative overflow-hidden">
      {/* Background */}
      <div className="absolute top-0 left-0 w-full h-56 bg-indigo-600 rounded-b-[2.5rem] overflow-hidden">
        <div className="absolute top-10 -right-10 w-40 h-40 bg-white opacity-10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-10 w-48 h-48 bg-purple-500 opacity-20 rounded-full blur-2xl" />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-12 pb-8 relative z-10 flex flex-col">
        {/* Branding */}
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="text-center mb-8"
        >
          <div className="relative w-16 h-16 bg-white rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-indigo-200 mb-4">
            <Globe2 size={32} className="text-indigo-600" />
            <Sparkles size={16} className="text-yellow-400 absolute -top-2 -right-2" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Welcome to HomeTongue</h1>
          <p className="text-indigo-200 text-sm mt-1">Let's set up your learning journey.</p>
        </motion.div>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-2 rounded-full transition-all duration-300 ${
                s === step ? "w-6 bg-indigo-600" : i < stepIndex ? "w-2 bg-indigo-300" : "w-2 bg-zinc-200"
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === "name" && (
            <motion.div
              key="name"
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -40, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-white rounded-3xl shadow-xl shadow-zinc-200/50 p-6 border border-zinc-100"
            >
              <h2 className="text-xl font-bold text-zinc-800 mb-1">What's your name?</h2>
              <p className="text-zinc-500 text-sm mb-6">
                This helps personalise your learning journey.
              </p>

              <form onSubmit={handleNameNext} className="space-y-4">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  autoFocus
                  maxLength={40}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-3 px-4 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-sm font-medium text-zinc-800 placeholder:font-normal placeholder:text-zinc-400"
                />
                <button
                  type="submit"
                  disabled={!name.trim()}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold rounded-xl py-3.5 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:pointer-events-none shadow-md shadow-indigo-200"
                >
                  Continue
                  <ArrowRight size={18} />
                </button>
              </form>
            </motion.div>
          )}

          {step === "voice" && (
            <motion.div
              key="voice"
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -40, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-white rounded-3xl shadow-xl shadow-zinc-200/50 p-6 border border-zinc-100"
            >
              <div className="flex items-center gap-2 mb-1">
                <Volume2 size={20} className="text-indigo-500" />
                <h2 className="text-xl font-bold text-zinc-800">Pick your voice</h2>
              </div>
              <p className="text-zinc-500 text-sm mb-5">
                Choose the voice for your learning journey.
              </p>

              {/* Gender tabs */}
              <div className="flex bg-zinc-100 rounded-xl p-1 mb-4">
                {(["female", "male"] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setVoiceGenderTab(g)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${
                      voiceGenderTab === g
                        ? "bg-white text-indigo-600 shadow-sm"
                        : "text-zinc-500 hover:text-zinc-700"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>

              {/* Voice cards */}
              <div className="space-y-2 mb-6">
                {VOICES.filter((v) => v.gender === voiceGenderTab).map((voice) => {
                  const selected = voiceId === voice.id;
                  return (
                    <button
                      key={voice.id}
                      onClick={() => setVoiceId(voice.id)}
                      className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all text-left ${
                        selected
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-zinc-100 bg-zinc-50 hover:border-zinc-200"
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${selected ? "bg-indigo-600" : "bg-zinc-200"}`}>
                        <Volume2 size={16} className={selected ? "text-white" : "text-zinc-500"} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold text-sm ${selected ? "text-indigo-700" : "text-zinc-800"}`}>
                            {voice.name}
                          </span>
                        </div>
                      </div>
                      <div
                        onClick={(e) => handlePreview(e, voice.id)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                          previewingId === voice.id
                            ? "bg-indigo-100"
                            : "bg-zinc-100 hover:bg-indigo-100"
                        }`}
                      >
                        {previewingId === voice.id
                          ? <Loader2 size={14} className="text-indigo-500 animate-spin" />
                          : <Volume2 size={14} className="text-zinc-500" />
                        }
                      </div>
                      {selected && (
                        <div className="w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center shrink-0">
                          <Check size={12} className="text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleVoiceNext}
                className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold rounded-xl py-3.5 flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-200"
              >
                Continue
                <ArrowRight size={18} />
              </button>
            </motion.div>
          )}

          {step === "persona" && (
            <motion.div
              key="persona"
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -40, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-white rounded-3xl shadow-xl shadow-zinc-200/50 p-6 border border-zinc-100"
            >
              <h2 className="text-xl font-bold text-zinc-800 mb-1">How will you use HomeTongue?</h2>
              <p className="text-zinc-500 text-sm mb-5">
                This helps the AI tailor translations to your context. You can change this anytime.
              </p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <button
                  onClick={() => setSelectedPersona("personal")}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                    selectedPersona === "personal"
                      ? "bg-indigo-50 border-indigo-400 shadow-sm"
                      : "bg-zinc-50 border-zinc-100 hover:border-zinc-200"
                  }`}
                >
                  <Home size={28} className={selectedPersona === "personal" ? "text-indigo-600" : "text-zinc-400"} />
                  <span className={`font-semibold text-sm ${selectedPersona === "personal" ? "text-indigo-700" : "text-zinc-600"}`}>
                    Personal
                  </span>
                  <span className="text-xs text-zinc-400 text-center leading-tight">Home & family conversations</span>
                  {selectedPersona === "personal" && (
                    <div className="w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center mt-1">
                      <Check size={12} className="text-white" />
                    </div>
                  )}
                </button>
                <button
                  onClick={() => setSelectedPersona("work")}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                    selectedPersona === "work"
                      ? "bg-indigo-50 border-indigo-400 shadow-sm"
                      : "bg-zinc-50 border-zinc-100 hover:border-zinc-200"
                  }`}
                >
                  <Briefcase size={28} className={selectedPersona === "work" ? "text-indigo-600" : "text-zinc-400"} />
                  <span className={`font-semibold text-sm ${selectedPersona === "work" ? "text-indigo-700" : "text-zinc-600"}`}>
                    Work
                  </span>
                  <span className="text-xs text-zinc-400 text-center leading-tight">Professional context</span>
                  {selectedPersona === "work" && (
                    <div className="w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center mt-1">
                      <Check size={12} className="text-white" />
                    </div>
                  )}
                </button>
              </div>

              <AnimatePresence>
                {selectedPersona === "work" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mb-4"
                  >
                    <p className="text-xs text-zinc-500 font-medium mb-2 pt-1">What's your job? <span className="text-zinc-400">(optional)</span></p>
                    <div className="flex flex-wrap gap-2">
                      {WORK_JOB_TITLES.map((title) => (
                        <button
                          key={title}
                          onClick={() => setSelectedJobTitle((prev) => prev === title ? null : title)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                            selectedJobTitle === title
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:border-zinc-300"
                          }`}
                        >
                          {title}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                onClick={handleFinish}
                className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold rounded-xl py-3.5 flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-200"
              >
                Start Learning
                <Sparkles size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
