import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Volume2, Check, Loader2, Home, Briefcase } from "lucide-react";
import { useProfile } from "../context/ProfileProvider";
import { useActiveLanguagePack } from "../../hooks/useActiveLanguageCode";
import { previewVoice } from "../../utils/voicePreviewCache";
import type { PersonaType } from "../../types";

const PREVIEW_TEXT = "你好，好高興認識你！";

type Step = "name" | "voice" | "persona" | "video";

export function OnboardingPage() {
  const { updateUserProfile } = useProfile();
  // Reactive pack resolution (not the module-level accessor): voice-less
  // packs (capabilities.tts false) have no display voices, so the voice step
  // is skipped entirely rather than rendering an empty picker.
  const displayVoices = useActiveLanguagePack().tts.displayVoices;
  const hasVoices = displayVoices.length > 0;
  const steps: Step[] = hasVoices ? ["name", "voice", "persona", "video"] : ["name", "persona", "video"];
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [voiceId, setVoiceId] = useState(displayVoices[0]?.key ?? "");
  const [voiceGenderTab, setVoiceGenderTab] = useState<"female" | "male">("female");
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<PersonaType>("personal");
  const videoRef = useRef<HTMLVideoElement>(null);

  const stepIndex = steps.indexOf(step);

  // `voiceId` was seeded from the pack active at MOUNT. If the pack changes
  // underneath (profile hydration resolving a different dialect), that seed
  // names a voice the new pack does not have — and onboarding would store it.
  // The pack's voice array is a module constant, so this only fires on a real
  // pack switch.
  useEffect(() => {
    setVoiceId(displayVoices[0]?.key ?? "");
  }, [displayVoices]);

  const handlePreview = async (e: React.SyntheticEvent, id: string) => {
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

  const goToNextStep = () => {
    const next = steps[steps.indexOf(step) + 1];
    if (next) setStep(next);
  };

  const handleNameNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    goToNextStep();
  };

  const handleVoiceNext = goToNextStep;

  const handlePersonaNext = goToNextStep;

  const handleFinish = () => {
    const updates: Parameters<typeof updateUserProfile>[0] = {
      name: name.trim(),
      // Voice-less packs skip the voice step and store no preference.
      ...(voiceId ? { preferredVoiceId: voiceId } : {}),
      activePersona: selectedPersona,
    };
    if (selectedPersona === "work") {
      // Seeding the work persona is what makes the Work choice mean anything:
      // tone resolves through the active persona, so without this the formal
      // tone the step promises never takes effect. (This used to be gated on
      // a job title no screen could set, so it never ran. A job-title picker
      // is still open product work — see the commit body.)
      updates.personaProfiles = { work: { tone: "formal" } };
    }
    updateUserProfile(updates);
  };

  if (step === "video") {
    return (
      <div className="flex flex-col h-full bg-black relative overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- intro.mp4 ships without a captions track; authoring a .vtt for it is open product work, not something a lint fix can supply */}
          <video
            ref={videoRef}
            src="/intro.mp4"
            className="max-w-[92%] max-h-[68vh] rounded-2xl object-contain"
            autoPlay
            playsInline
            onEnded={handleFinish}
          />
        </div>
        <div className="px-6 pb-8 pt-4">
          <button
            onClick={handleFinish}
            className="w-full bg-white/10 hover:bg-white/20 backdrop-blur text-white font-semibold rounded-xl py-3.5 flex items-center justify-center gap-2 transition-all border border-white/20"
          >
            Get Started
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card relative overflow-hidden">
      {/* Background */}
      <div className="absolute top-0 left-0 w-full h-56 bg-brand-blue rounded-b-[2.5rem] overflow-hidden">
        <div className="absolute top-10 -right-10 w-40 h-40 bg-white opacity-10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-10 w-48 h-48 bg-brand-red opacity-20 rounded-full blur-2xl" />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-12 pb-8 relative z-10 flex flex-col scrollbar-none">
        {/* Branding */}
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="text-center mb-8"
        >
          <img
            src="/logo.png"
            alt="HomeTongue"
            className="w-16 h-16 rounded-2xl mx-auto shadow-lg shadow-brand-blue/20 mb-4 object-cover"
          />
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Welcome to HomeTongue</h1>
          <p className="text-white/80 text-sm mt-1">Let's set up your learning journey.</p>
        </motion.div>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-6">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`h-2 rounded-full transition-all duration-300 ${
                s === step ? "w-6 bg-brand-blue" : i < stepIndex ? "w-2 bg-brand-blue/40" : "w-2 bg-secondary"
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
              className="bg-card rounded-3xl shadow-xl shadow-border/50 p-6 border border-border-subtle"
            >
              <h2 className="text-xl font-bold text-foreground mb-1">What's your name?</h2>
              <p className="text-muted-foreground text-sm mb-6">
                This helps personalise your learning journey.
              </p>

              <form onSubmit={handleNameNext} className="space-y-4">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  aria-label="Your name"
                  // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: the name field is the sole control of the just-shown onboarding step
                  autoFocus
                  maxLength={40}
                  className="w-full bg-input-background border border-border rounded-xl py-3 px-4 outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue transition-all text-sm font-medium text-foreground placeholder:font-normal placeholder:text-faint"
                />
                <button
                  type="submit"
                  disabled={!name.trim()}
                  className="w-full bg-brand-blue hover:bg-brand-blue/90 active:bg-brand-blue/80 text-white font-semibold rounded-xl py-3.5 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:pointer-events-none shadow-md shadow-brand-blue/20"
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
              className="bg-card rounded-3xl shadow-xl shadow-border/50 p-6 border border-border-subtle"
            >
              <div className="flex items-center gap-2 mb-1">
                <Volume2 size={20} className="text-brand-blue" />
                <h2 className="text-xl font-bold text-foreground">Pick your voice</h2>
              </div>
              <p className="text-muted-foreground text-sm mb-5">
                Choose the voice for your learning journey.
              </p>

              {/* Gender tabs */}
              <div className="flex bg-muted rounded-xl p-1 mb-4">
                {(["female", "male"] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setVoiceGenderTab(g)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${
                      voiceGenderTab === g
                        ? "bg-card text-brand-blue shadow-sm"
                        : "text-muted-foreground hover:text-foreground/90"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>

              {/* Voice cards */}
              <div className="space-y-2 mb-6">
                {displayVoices
                  .filter((v) => v.gender === voiceGenderTab)
                  .map((voice) => {
                    const selected = voiceId === voice.key;
                    return (
                      <button
                        key={voice.key}
                        onClick={() => setVoiceId(voice.key)}
                        className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all text-left ${
                          selected
                            ? "border-brand-blue bg-brand-blue/10"
                            : "border-border-subtle bg-background hover:border-border"
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${selected ? "bg-brand-blue" : "bg-secondary"}`}
                        >
                          <Volume2 size={16} className={selected ? "text-white" : "text-muted-foreground"} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-semibold text-sm ${selected ? "text-brand-blue" : "text-foreground"}`}
                            >
                              {voice.label}
                            </span>
                          </div>
                        </div>
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label={`Preview ${voice.label} voice`}
                          onClick={(e) => handlePreview(e, voice.key)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handlePreview(e, voice.key);
                            }
                          }}
                          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                            previewingId === voice.key
                              ? "bg-brand-blue/15"
                              : "bg-muted hover:bg-brand-blue/15"
                          }`}
                        >
                          {previewingId === voice.key ? (
                            <Loader2 size={14} className="text-brand-blue animate-spin" />
                          ) : (
                            <Volume2 size={14} className="text-muted-foreground" />
                          )}
                        </div>
                        {selected && (
                          <div className="w-5 h-5 bg-brand-blue rounded-full flex items-center justify-center shrink-0">
                            <Check size={12} className="text-white" />
                          </div>
                        )}
                      </button>
                    );
                  })}
              </div>

              <button
                onClick={handleVoiceNext}
                className="w-full bg-brand-blue hover:bg-brand-blue/90 active:bg-brand-blue/80 text-white font-semibold rounded-xl py-3.5 flex items-center justify-center gap-2 transition-all shadow-md shadow-brand-blue/20"
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
              className="bg-card rounded-3xl shadow-xl shadow-border/50 p-6 border border-border-subtle"
            >
              <h2 className="text-xl font-bold text-foreground mb-1">How will you use HomeTongue?</h2>
              <p className="text-muted-foreground text-sm mb-5">
                This helps the AI tailor translations to your context. You can change this anytime.
              </p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <button
                  onClick={() => setSelectedPersona("personal")}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                    selectedPersona === "personal"
                      ? "bg-brand-blue/10 border-brand-blue shadow-sm"
                      : "bg-background border-border-subtle hover:border-border"
                  }`}
                >
                  <Home
                    size={28}
                    className={selectedPersona === "personal" ? "text-brand-blue" : "text-faint"}
                  />
                  <span
                    className={`font-semibold text-sm ${selectedPersona === "personal" ? "text-brand-blue" : "text-muted-foreground"}`}
                  >
                    Personal
                  </span>
                  <span className="text-xs text-faint text-center leading-tight">
                    Home & family conversations
                  </span>
                  {selectedPersona === "personal" && (
                    <div className="w-5 h-5 bg-brand-blue rounded-full flex items-center justify-center mt-1">
                      <Check size={12} className="text-white" />
                    </div>
                  )}
                </button>
                <button
                  onClick={() => setSelectedPersona("work")}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                    selectedPersona === "work"
                      ? "bg-brand-blue/10 border-brand-blue shadow-sm"
                      : "bg-background border-border-subtle hover:border-border"
                  }`}
                >
                  <Briefcase
                    size={28}
                    className={selectedPersona === "work" ? "text-brand-blue" : "text-faint"}
                  />
                  <span
                    className={`font-semibold text-sm ${selectedPersona === "work" ? "text-brand-blue" : "text-muted-foreground"}`}
                  >
                    Work
                  </span>
                  <span className="text-xs text-faint text-center leading-tight">Professional context</span>
                  {selectedPersona === "work" && (
                    <div className="w-5 h-5 bg-brand-blue rounded-full flex items-center justify-center mt-1">
                      <Check size={12} className="text-white" />
                    </div>
                  )}
                </button>
              </div>

              <button
                onClick={handlePersonaNext}
                className="w-full bg-brand-blue hover:bg-brand-blue/90 active:bg-brand-blue/80 text-white font-semibold rounded-xl py-3.5 flex items-center justify-center gap-2 transition-all shadow-md shadow-brand-blue/20"
              >
                Continue
                <ArrowRight size={18} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
