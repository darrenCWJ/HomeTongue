import React, { useState, useRef, useEffect } from "react";
import { User, Globe, Sliders, Sparkles, Brain, ChevronDown, Check, Volume2, Loader2, Mic, MicOff, Trash2 } from "lucide-react";
import { useAppContext, Tone } from "../context/AppContext";
import { VOICES } from "../../constants/voices";
import { previewVoice } from "../../utils/voicePreviewCache";
import { useAudioRecorder, cloneVoice, deleteClonedVoice } from "../../hooks/useElevenLabs";

const PREVIEW_TEXT = "你好，好高興認識你！";

export function ProfilePage() {
  const { dialect, setDialect, tone, setTone, learnedCount, setIsSignedIn, userProfile, updateUserProfile } = useAppContext();
  const [isDialectDropdownOpen, setIsDialectDropdownOpen] = useState(false);
  const [nameInput, setNameInput] = useState(userProfile?.name ?? "");
  const [voiceGenderTab, setVoiceGenderTab] = useState<"female" | "male" | "my-voice">("female");
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [isCloning, setIsCloning] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { startRecording, stopRecording } = useAudioRecorder();

  const handlePreview = async (e: React.MouseEvent, id: string) => {
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

  const handleNameBlur = () => {
    const trimmed = nameInput.trim();
    if (trimmed !== (userProfile?.name ?? "")) {
      updateUserProfile({ name: trimmed });
    }
  };

  const handleStartRecording = async () => {
    setRecordedBlob(null);
    setRecordSeconds(0);
    await startRecording();
    setIsRecording(true);
    timerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
  };

  const handleStopRecording = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
    const blob = await stopRecording();
    setRecordedBlob(blob);
  };

  const handleCloneVoice = async () => {
    if (!recordedBlob) return;
    setIsCloning(true);
    try {
      if (userProfile?.customVoiceId) {
        await deleteClonedVoice(userProfile.customVoiceId).catch(() => {});
      }
      const name = `${userProfile?.name || "User"}'s Voice`;
      const voiceId = await cloneVoice(recordedBlob, name);
      updateUserProfile({ customVoiceId: voiceId, preferredVoiceId: voiceId });
      setRecordedBlob(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Voice cloning failed";
      alert(msg);
    } finally {
      setIsCloning(false);
    }
  };

  const handleDeleteCustomVoice = async () => {
    if (!userProfile?.customVoiceId) return;
    await deleteClonedVoice(userProfile.customVoiceId).catch(() => {});
    updateUserProfile({ customVoiceId: undefined, preferredVoiceId: VOICES[0].id });
    setRecordedBlob(null);
  };
  const dropdownRef = useRef<HTMLDivElement>(null);

  const dialects = ["Cantonese", "Hokkien", "Teochew", "Hakka"];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDialectDropdownOpen(false);
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
          <span>{userProfile?.personaSummary ? "AI Persona Active" : "Persona Building..."}</span>
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
        {/* AI Personality Summary */}
        <section>
          <div className="bg-white rounded-3xl shadow-sm border border-indigo-100 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-full -mr-10 -mt-10 blur-xl"></div>
            <div className="p-5 relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={18} className="text-indigo-500" />
                <h2 className="font-bold text-zinc-800">AI Vibe Analysis</h2>
              </div>

              {userProfile?.personaSummary ? (
                <>
                  <p className="text-sm text-zinc-600 leading-relaxed">
                    {userProfile.personaSummary}
                  </p>
                  {(userProfile.characteristicPhrases?.length ?? 0) > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                        Your Phrases
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {userProfile.characteristicPhrases!.map((phrase, i) => (
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
                    Your persona will appear here after your first conversation.
                    <br />
                    It gets smarter after every chat.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-zinc-100 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-zinc-800">{learnedCount}</span>
            <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Phrases Learned</span>
          </div>
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-zinc-100 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-zinc-800">1</span>
            <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Dialect active</span>
          </div>
        </div>

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
                className={`text-zinc-400 transition-transform ${isDialectDropdownOpen ? 'rotate-180' : ''}`}
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
                      dialect === d ? 'bg-indigo-50' : ''
                    }`}
                  >
                    <span className={`font-medium ${dialect === d ? 'text-indigo-600' : 'text-zinc-800'}`}>
                      {d}
                    </span>
                    {dialect === d && (
                      <Check size={18} className="text-indigo-600" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Settings: Personality / Tone Override */}
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
            <button
              onClick={() => setVoiceGenderTab("my-voice")}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                voiceGenderTab === "my-voice"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              My Voice
            </button>
          </div>

          {voiceGenderTab === "my-voice" ? (
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
              {userProfile?.customVoiceId && !recordedBlob ? (
                /* Custom voice exists — show it as selected */
                <div className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                        <Mic size={18} className="text-indigo-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-zinc-800 text-sm">{userProfile.name ? `${userProfile.name}'s Voice` : "My Voice"}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">Custom cloned voice · Active</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleStartRecording}
                      className="flex-1 py-2 text-xs font-semibold text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors"
                    >
                      Re-record
                    </button>
                    <button
                      onClick={handleDeleteCustomVoice}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-500 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
                    >
                      <Trash2 size={13} />
                      Remove
                    </button>
                  </div>
                </div>
              ) : recordedBlob ? (
                /* Recording done — ready to upload */
                <div className="p-4 text-center">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                    <Mic size={24} className="text-emerald-600" />
                  </div>
                  <p className="font-semibold text-zinc-800 mb-1">Sample recorded</p>
                  <p className="text-xs text-zinc-500 mb-4">Ready to create your voice clone</p>
                  <button
                    onClick={handleCloneVoice}
                    disabled={isCloning}
                    className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {isCloning ? <><Loader2 size={16} className="animate-spin" /> Creating voice…</> : "Create My Voice"}
                  </button>
                  <button
                    onClick={() => setRecordedBlob(null)}
                    className="mt-2 w-full py-2 text-xs text-zinc-400 hover:text-zinc-600"
                  >
                    Discard & re-record
                  </button>
                </div>
              ) : isRecording ? (
                /* Currently recording */
                <div className="p-4 text-center">
                  <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3 relative">
                    <span className="absolute w-full h-full rounded-full bg-red-200 animate-ping opacity-60" />
                    <Mic size={24} className="text-red-600 relative z-10" />
                  </div>
                  <p className="font-semibold text-zinc-800 mb-1">Recording… {recordSeconds}s</p>
                  <p className="text-xs text-zinc-500 mb-4">Speak clearly — aim for at least 30 seconds</p>
                  <button
                    onClick={handleStopRecording}
                    className="w-full py-3 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <MicOff size={16} />
                    Stop Recording
                  </button>
                </div>
              ) : (
                /* No custom voice yet */
                <div className="p-4 text-center">
                  <div className="w-14 h-14 rounded-full bg-zinc-100 flex items-center justify-center mx-auto mb-3">
                    <Mic size={24} className="text-zinc-400" />
                  </div>
                  <p className="font-semibold text-zinc-800 mb-1">Record your voice</p>
                  <p className="text-xs text-zinc-500 mb-1">Your voice will be cloned and used for all replies.</p>
                  <p className="text-xs text-zinc-400 mb-4">Speak clearly for at least 30 seconds for best results.</p>
                  <button
                    onClick={handleStartRecording}
                    className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Mic size={16} />
                    Start Recording
                  </button>
                </div>
              )}
            </div>
          ) : (
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
                          {voice.accent}
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
          )}
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
