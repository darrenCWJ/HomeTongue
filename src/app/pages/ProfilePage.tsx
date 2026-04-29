import React, { useState, useRef, useEffect } from "react"; // useRef kept for dropdownRef
import { User, Globe, Sliders, Sparkles, Brain, ChevronDown, Check, Home, Briefcase, Volume2, Loader2 } from "lucide-react";
import { useAppContext, Tone } from "../context/AppContext";
import { WORK_JOB_TITLES, type WorkJobTitle, type PersonaType } from "../../types";
import { VOICES } from "../../constants/voices";
import { previewVoice } from "../../utils/voicePreviewCache";

const PREVIEW_TEXT = "你好，好高興認識你！";

export function ProfilePage() {
  const {
    dialect, setDialect, tone, setTone,
    setIsSignedIn,
    userProfile, updateUserProfile,
    activePersona,
  } = useAppContext();

  const [isDialectDropdownOpen, setIsDialectDropdownOpen] = useState(false);
  const [isJobTitleDropdownOpen, setIsJobTitleDropdownOpen] = useState(false);
  const [nameInput, setNameInput] = useState(userProfile?.name ?? "");
  const [voiceGenderTab, setVoiceGenderTab] = useState<"female" | "male">("female");
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const handlePreview = async (e: React.MouseEvent, id: typeof VOICES[number]["id"]) => {
    e.preventDefault();
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

  const handleDeleteCustomVoice = () => {
    updateUserProfile({ customVoiceId: undefined, preferredVoiceId: VOICES[0].id });
  };

  const handleNameBlur = () => {
    const trimmed = nameInput.trim();
    if (trimmed !== (userProfile?.name ?? "")) {
      updateUserProfile({ name: trimmed });
    }
  };

  const dropdownRef = useRef<HTMLDivElement>(null);
  const jobTitleDropdownRef = useRef<HTMLDivElement>(null);

  const dialects = ["Cantonese", "Hokkien", "Teochew", "Hakka"];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDialectDropdownOpen(false);
      }
      if (jobTitleDropdownRef.current && !jobTitleDropdownRef.current.contains(event.target as Node)) {
        setIsJobTitleDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const tones: { value: Tone; label: string; desc: string }[] = [
    { value: "formal", label: "Formal & Polite", desc: "For work or speaking with elders" },
    { value: "casual", label: "Casual & Friendly", desc: "For daily conversations with peers" },
    { value: "slang", label: "Street & Slang", desc: "Sound like a true local" },
  ];

  const workProfile = userProfile?.personaProfiles?.work;
  const activePersonaProfile = userProfile?.personaProfiles?.[activePersona];
  const personaSummary = activePersonaProfile?.personaSummary
    ?? (activePersona === "personal" ? userProfile?.personaSummary : undefined);
  const characteristicPhrases = activePersonaProfile?.characteristicPhrases
    ?? (activePersona === "personal" ? userProfile?.characteristicPhrases : undefined);

  const handleSelectPersona = (p: PersonaType) => {
    updateUserProfile({ activePersona: p });
  };

  const handleSelectJobTitle = (title: WorkJobTitle) => {
    updateUserProfile({
      personaProfiles: {
        ...userProfile?.personaProfiles,
        work: { ...workProfile, tone: workProfile?.tone ?? "formal", jobTitle: title },
      },
    });
    setIsJobTitleDropdownOpen(false);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50 pb-20 overflow-y-auto">
      {/* Header Profile Area */}
      <div className="shrink-0 bg-white px-6 pt-10 pb-6 border-b border-zinc-200 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-indigo-100 to-white/0 opacity-50 pointer-events-none"></div>
        <div className="w-24 h-24 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-md relative z-10">
          <User size={40} className="text-white" />
          <div className="absolute bottom-0 right-0 bg-white rounded-full p-1 shadow-sm border border-zinc-100">
            <Sparkles size={16} className="text-yellow-500 fill-yellow-500" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-zinc-900">
          {userProfile?.name || "Your Persona"}
        </h1>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-semibold mt-2 border border-indigo-100 shadow-sm">
          <Brain size={14} />
          <span>{personaSummary ? "AI Persona Active" : "Persona Building..."}</span>
        </div>

        {/* Name input */}
        <div className="mt-4 w-full max-w-xs mx-auto">
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={handleNameBlur}
            placeholder="Enter your name"
            className="w-full text-center text-sm px-4 py-2 rounded-xl border border-zinc-200 bg-zinc-50 focus:outline-none focus:border-indigo-400 text-zinc-700 placeholder-zinc-400"
          />
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Persona Switcher */}
        <section>
          <div className="flex items-center gap-2 mb-3 px-2">
            <User size={18} className="text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">Active Persona</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleSelectPersona("personal")}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                activePersona === "personal"
                  ? "bg-indigo-50 border-indigo-400 shadow-sm"
                  : "bg-white border-zinc-100 hover:border-zinc-300"
              }`}
            >
              <Home size={24} className={activePersona === "personal" ? "text-indigo-600" : "text-zinc-400"} />
              <span className={`font-semibold text-sm ${activePersona === "personal" ? "text-indigo-700" : "text-zinc-600"}`}>
                Personal
              </span>
              <span className="text-xs text-zinc-400 text-center">Home & family conversations</span>
            </button>
            <button
              onClick={() => handleSelectPersona("work")}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                activePersona === "work"
                  ? "bg-indigo-50 border-indigo-400 shadow-sm"
                  : "bg-white border-zinc-100 hover:border-zinc-300"
              }`}
            >
              <Briefcase size={24} className={activePersona === "work" ? "text-indigo-600" : "text-zinc-400"} />
              <span className={`font-semibold text-sm ${activePersona === "work" ? "text-indigo-700" : "text-zinc-600"}`}>
                Work
              </span>
              <span className="text-xs text-zinc-400 text-center">Professional context</span>
            </button>
          </div>

          {/* Job title picker — shown only when Work is active */}
          {activePersona === "work" && (
            <div className="mt-3 relative" ref={jobTitleDropdownRef}>
              <button
                onClick={() => setIsJobTitleDropdownOpen(!isJobTitleDropdownOpen)}
                className="w-full bg-white rounded-2xl shadow-sm border border-zinc-100 p-4 flex items-center justify-between hover:bg-zinc-50 transition-colors"
              >
                <span className="text-zinc-800 font-medium">
                  {workProfile?.jobTitle ?? "Select your job title"}
                </span>
                <ChevronDown
                  size={20}
                  className={`text-zinc-400 transition-transform ${isJobTitleDropdownOpen ? "rotate-180" : ""}`}
                />
              </button>

              {isJobTitleDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-lg border border-zinc-200 overflow-hidden z-20">
                  {WORK_JOB_TITLES.map((title) => (
                    <button
                      key={title}
                      onClick={() => handleSelectJobTitle(title)}
                      className={`w-full p-4 flex items-center justify-between hover:bg-indigo-50 transition-colors ${
                        workProfile?.jobTitle === title ? "bg-indigo-50" : ""
                      }`}
                    >
                      <span className={`font-medium ${workProfile?.jobTitle === title ? "text-indigo-600" : "text-zinc-800"}`}>
                        {title}
                      </span>
                      {workProfile?.jobTitle === title && <Check size={18} className="text-indigo-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* AI Personality Summary */}
        <section>
          <div className="bg-white rounded-3xl shadow-sm border border-indigo-100 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-full -mr-10 -mt-10 blur-xl"></div>
            <div className="p-5 relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={18} className="text-indigo-500" />
                <h2 className="font-bold text-zinc-800">AI Vibe Analysis</h2>
              </div>
              <p className="text-xs text-zinc-400 mb-3">
                {activePersona === "personal"
                  ? "Personal persona"
                  : `Work persona${workProfile?.jobTitle ? ` · ${workProfile.jobTitle}` : ""}`}
              </p>

              {personaSummary ? (
                <>
                  <p className="text-sm text-zinc-600 leading-relaxed">
                    {personaSummary}
                  </p>
                  {(characteristicPhrases?.length ?? 0) > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                        Your Phrases
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {characteristicPhrases!.map((phrase, i) => (
                          <span
                            key={i}
                            className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium border border-indigo-100"
                          >
                            "{phrase}"
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-6">
                  <Brain size={32} className="text-zinc-200 mx-auto mb-3" />
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    Your {activePersona} persona will appear here after your first conversation.
                    <br />
                    It gets smarter after every chat.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Settings: Target Dialect */}
        <section>
          <div className="flex items-center gap-2 mb-3 px-2">
            <Globe size={18} className="text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">Target Dialect</h2>
          </div>
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDialectDropdownOpen(!isDialectDropdownOpen)}
              className="w-full bg-white rounded-2xl shadow-sm border border-zinc-100 p-4 flex items-center justify-between hover:bg-zinc-50 transition-colors"
            >
              <span className="text-zinc-800 font-medium">{dialect}</span>
              <ChevronDown
                size={20}
                className={`text-zinc-400 transition-transform ${isDialectDropdownOpen ? "rotate-180" : ""}`}
              />
            </button>

            {isDialectDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-lg border border-zinc-200 overflow-hidden z-20">
                {dialects.map((d) => (
                  <button
                    key={d}
                    onClick={() => {
                      setDialect(d);
                      setIsDialectDropdownOpen(false);
                    }}
                    className={`w-full p-4 flex items-center justify-between hover:bg-indigo-50 transition-colors ${
                      dialect === d ? "bg-indigo-50" : ""
                    }`}
                  >
                    <span className={`font-medium ${dialect === d ? "text-indigo-600" : "text-zinc-800"}`}>
                      {d}
                    </span>
                    {dialect === d && <Check size={18} className="text-indigo-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Settings: Manual Tone Override */}
        <section>
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
            {/* Toggle header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <Sliders size={18} className="text-zinc-400" />
                <div>
                  <p className="text-sm font-semibold text-zinc-800">Manual Tone Override</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {userProfile?.toneOverrideEnabled !== false ? "Using your selected tone" : "Auto — AI decides the tone"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => updateUserProfile({ toneOverrideEnabled: userProfile?.toneOverrideEnabled === false })}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                  userProfile?.toneOverrideEnabled !== false ? "bg-indigo-600" : "bg-zinc-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                    userProfile?.toneOverrideEnabled !== false ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Tone options — only interactive when override is on */}
            <div className={`divide-y divide-zinc-100 transition-opacity duration-200 ${
              userProfile?.toneOverrideEnabled !== false ? "opacity-100" : "opacity-40 pointer-events-none"
            }`}>
              {tones.map((t) => (
                <label key={t.value} className="flex items-center p-4 cursor-pointer hover:bg-zinc-50 transition-colors">
                  <div className="flex-1">
                    <h3 className={`font-medium ${tone === t.value ? "text-indigo-600" : "text-zinc-800"}`}>
                      {t.label}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">{t.desc}</p>
                  </div>
                  <div className="relative flex items-center justify-center w-6 h-6 ml-4">
                    <input
                      type="radio"
                      name="tone"
                      value={t.value}
                      checked={tone === t.value}
                      onChange={() => setTone(t.value)}
                      className="peer appearance-none w-5 h-5 border-2 border-zinc-300 rounded-full checked:border-indigo-600 transition-colors cursor-pointer"
                    />
                    {tone === t.value && (
                      <div className="absolute w-2.5 h-2.5 bg-indigo-600 rounded-full pointer-events-none" />
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* Voice Selector */}
        <section>
          <div className="flex items-center gap-2 mb-3 px-2">
            <Volume2 size={18} className="text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">Voice</h2>
          </div>

          {/* Voice tabs */}
          <div className="flex bg-zinc-100 rounded-xl p-1 mb-3">
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

          <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden divide-y divide-zinc-100">
            {VOICES.filter((v) => v.gender === voiceGenderTab).map((voice) => {
              const selected = (userProfile?.preferredVoiceId ?? VOICES[0].id) === voice.id;
              return (
                <label key={voice.id} className="flex items-center p-4 cursor-pointer hover:bg-zinc-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className={`font-medium ${selected ? "text-indigo-600" : "text-zinc-800"}`}>
                        {voice.name}
                      </h3>
                      <span className="text-xs px-2 py-0.5 bg-zinc-100 text-zinc-500 rounded-full shrink-0">
                        {voice.style}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{voice.desc}</p>
                  </div>
                  <button
                    onClick={(e) => handlePreview(e, voice.id)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mr-2 transition-colors ${
                      previewingId === voice.id
                        ? "bg-indigo-100"
                        : "bg-zinc-100 hover:bg-indigo-100"
                    }`}
                  >
                    {previewingId === voice.id
                      ? <Loader2 size={14} className="text-indigo-500 animate-spin" />
                      : <Volume2 size={14} className="text-zinc-500" />
                    }
                  </button>
                  <div className="relative flex items-center justify-center w-6 h-6 shrink-0">
                    <input
                      type="radio"
                      name="voice"
                      value={voice.id}
                      checked={selected}
                      onChange={() => updateUserProfile({ preferredVoiceId: voice.id })}
                      className="peer appearance-none w-5 h-5 border-2 border-zinc-300 rounded-full checked:border-indigo-600 transition-colors cursor-pointer"
                    />
                    {selected && (
                      <div className="absolute w-2.5 h-2.5 bg-indigo-600 rounded-full pointer-events-none" />
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </section>

        {/* Sign Out */}
        <div className="pt-4">
          <button
            onClick={() => setIsSignedIn(false)}
            className="w-full bg-white text-red-500 border border-red-100 font-semibold rounded-2xl py-4 shadow-sm hover:bg-red-50 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
