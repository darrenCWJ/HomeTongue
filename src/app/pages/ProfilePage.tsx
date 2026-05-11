import React, { useState, useRef, useEffect } from "react"; // useRef kept for dropdownRef
import { User, Sparkles, Brain, ChevronDown, Check, Home, Briefcase, Volume2, Loader2, Pencil, HelpCircle, MessageCircle, BookOpen, Bookmark } from "lucide-react";
import { useNavigate } from "react-router";
import { useAppContext } from "../context/AppContext";
import { WORK_JOB_TITLES, type WorkJobTitle, type PersonaType } from "../../types";
import { VOICES } from "../../constants/voices";
import { previewVoice } from "../../utils/voicePreviewCache";
import { useTour } from "../components/tour/TourProvider";

const PREVIEW_TEXT = "你好，好高興認識你！";

export function ProfilePage() {
  const {
    setIsSignedIn,
    userProfile, updateUserProfile,
    activePersona,
  } = useAppContext();
  const { startTour } = useTour();
  const navigate = useNavigate();

  const [isJobTitleDropdownOpen, setIsJobTitleDropdownOpen] = useState(false);
  const [nameInput, setNameInput] = useState(userProfile?.name ?? "");
  const [isEditingName, setIsEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
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
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") nameInputRef.current?.blur();
  };

  const handleEditNameClick = () => {
    setIsEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const jobTitleDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (jobTitleDropdownRef.current && !jobTitleDropdownRef.current.contains(event.target as Node)) {
        setIsJobTitleDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-brand-blue/20 to-white/0 opacity-50 pointer-events-none"></div>
        <div className="w-24 h-24 bg-gradient-to-tr from-brand-blue to-brand-red rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-md relative z-10">
          <User size={40} className="text-white" />
          <div className="absolute bottom-0 right-0 bg-white rounded-full p-1 shadow-sm border border-zinc-100">
            <Sparkles size={16} className="text-brand-yellow fill-brand-yellow" />
          </div>
        </div>
        <div className="flex items-center justify-center gap-2">
          {isEditingName ? (
            <input
              ref={nameInputRef}
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={handleNameKeyDown}
              placeholder="Enter your name"
              className="text-2xl font-bold text-center text-zinc-900 bg-transparent border-b-2 border-brand-blue focus:outline-none w-48"
            />
          ) : (
            <>
              <h1 className="text-2xl font-bold text-zinc-900">
                {userProfile?.name || "Your Persona"}
              </h1>
              <button
                onClick={handleEditNameClick}
                className="text-zinc-400 hover:text-brand-blue transition-colors"
                aria-label="Edit name"
              >
                <Pencil size={16} />
              </button>
            </>
          )}
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-brand-blue/10 text-brand-blue rounded-full text-sm font-semibold mt-2 border border-brand-blue/15 shadow-sm">
          <Brain size={14} />
          <span>{personaSummary ? "AI Persona Active" : "Persona Building..."}</span>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Persona Switcher */}
        <section data-tour="profile-persona-switcher">
          <div className="flex items-center gap-2 mb-3 px-2">
            <User size={18} className="text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">Active Persona</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleSelectPersona("personal")}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                activePersona === "personal"
                  ? "bg-brand-blue/10 border-brand-blue shadow-sm"
                  : "bg-white border-zinc-100 hover:border-zinc-300"
              }`}
            >
              <Home size={24} className={activePersona === "personal" ? "text-brand-blue" : "text-zinc-400"} />
              <span className={`font-semibold text-sm ${activePersona === "personal" ? "text-brand-blue" : "text-zinc-600"}`}>
                Personal
              </span>
              <span className="text-xs text-zinc-400 text-center">Home & family conversations</span>
            </button>
            <button
              onClick={() => handleSelectPersona("work")}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                activePersona === "work"
                  ? "bg-brand-blue/10 border-brand-blue shadow-sm"
                  : "bg-white border-zinc-100 hover:border-zinc-300"
              }`}
            >
              <Briefcase size={24} className={activePersona === "work" ? "text-brand-blue" : "text-zinc-400"} />
              <span className={`font-semibold text-sm ${activePersona === "work" ? "text-brand-blue" : "text-zinc-600"}`}>
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
                      className={`w-full p-4 flex items-center justify-between hover:bg-brand-blue/10 transition-colors ${
                        workProfile?.jobTitle === title ? "bg-brand-blue/10" : ""
                      }`}
                    >
                      <span className={`font-medium ${workProfile?.jobTitle === title ? "text-brand-blue" : "text-zinc-800"}`}>
                        {title}
                      </span>
                      {workProfile?.jobTitle === title && <Check size={18} className="text-brand-blue" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* AI Personality Summary */}
        <section>
          <div className="bg-white rounded-3xl shadow-sm border border-brand-blue/15 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-brand-blue/10 to-brand-red/10 rounded-full -mr-10 -mt-10 blur-xl"></div>
            <div className="p-5 relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={18} className="text-brand-blue" />
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
                            className="px-3 py-1 bg-brand-blue/10 text-brand-blue rounded-full text-xs font-medium border border-brand-blue/15"
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

        {/* Suggested Replies Toggle */}
        <section>
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-zinc-400" />
                <div>
                  <p className="text-sm font-semibold text-zinc-800">Suggested Replies</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {userProfile?.suggestedRepliesEnabled !== false ? "Showing reply suggestions in chat" : "Suggestions hidden"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => updateUserProfile({ suggestedRepliesEnabled: userProfile?.suggestedRepliesEnabled === false })}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                  userProfile?.suggestedRepliesEnabled !== false ? "bg-brand-blue" : "bg-zinc-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                    userProfile?.suggestedRepliesEnabled !== false ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Voice Selector */}
        <section data-tour="profile-voice-selection">
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
                    ? "bg-white text-brand-blue shadow-sm"
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
                      <h3 className={`font-medium ${selected ? "text-brand-blue" : "text-zinc-800"}`}>
                        {voice.name}
                      </h3>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handlePreview(e, voice.id)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mr-2 transition-colors ${
                      previewingId === voice.id
                        ? "bg-brand-blue/15"
                        : "bg-zinc-100 hover:bg-brand-blue/15"
                    }`}
                  >
                    {previewingId === voice.id
                      ? <Loader2 size={14} className="text-brand-blue animate-spin" />
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
                      className="peer appearance-none w-5 h-5 border-2 border-zinc-300 rounded-full checked:border-brand-blue transition-colors cursor-pointer"
                    />
                    {selected && (
                      <div className="absolute w-2.5 h-2.5 bg-brand-blue rounded-full pointer-events-none" />
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </section>

        {/* Replay Tour */}
        <section data-tour="profile-tour-replay">
          <div className="flex items-center gap-2 mb-3 px-2">
            <HelpCircle size={18} className="text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">Replay Tour</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {([
              { id: "chat" as const, label: "Chat", icon: <MessageCircle size={20} />, path: "/" },
              { id: "learn" as const, label: "Learn", icon: <BookOpen size={20} />, path: "/learn" },
              { id: "bookmarks" as const, label: "Bookmarks", icon: <Bookmark size={20} />, path: "/bookmarks" },
              { id: "profile" as const, label: "Profile", icon: <User size={20} />, path: "/profile" },
            ]).map((tour) => (
              <button
                key={tour.id}
                onClick={() => {
                  if (tour.id === "profile") {
                    startTour("profile");
                  } else {
                    navigate(tour.path);
                    setTimeout(() => startTour(tour.id), 300);
                  }
                }}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white border border-zinc-100 shadow-sm hover:border-brand-blue/50 hover:bg-brand-blue/10 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-blue/10 flex items-center justify-center text-brand-blue">
                  {tour.icon}
                </div>
                <span className="text-sm font-semibold text-zinc-700">{tour.label}</span>
              </button>
            ))}
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
