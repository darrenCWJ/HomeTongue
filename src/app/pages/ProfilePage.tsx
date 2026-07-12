import React, { useState, useRef } from "react";
import {
  User,
  Sparkles,
  Brain,
  Home,
  Briefcase,
  Volume2,
  Loader2,
  Pencil,
  HelpCircle,
  MessageCircle,
  BookOpen,
  Bookmark,
  LogOut,
  ShieldCheck,
  SunMoon,
  UploadCloud,
} from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useAuth } from "../context/AuthProvider";
import { useProfile } from "../context/ProfileProvider";
import { type PersonaType } from "../../types";
import { useActiveLanguagePack } from "../../hooks/useActiveLanguageCode";
import { previewVoice } from "../../utils/voicePreviewCache";
import { importLocalDataToCloud } from "../../services/cloudImportService";
import { useTour } from "../components/tour/TourProvider";
import { useTheme } from "../../hooks/useTheme";

const PREVIEW_TEXT = "你好，好高興認識你！";

export function ProfilePage() {
  const { isCloudAuthEnabled, authUser, signOut } = useAuth();
  const { setIsSignedIn, userProfile, updateUserProfile, activePersona } = useProfile();
  // Reactive pack resolution (not the module-level accessor): voice-less
  // packs have no display voices and the whole Voice section is hidden.
  const displayVoices = useActiveLanguagePack().tts.displayVoices;
  const { startTour } = useTour();
  const { preference: themePreference, setTheme } = useTheme();
  const navigate = useNavigate();

  const [nameInput, setNameInput] = useState(userProfile?.name ?? "");
  const [isEditingName, setIsEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [voiceGenderTab, setVoiceGenderTab] = useState<"female" | "male">("female");
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const hasDataConsent = userProfile?.dataCollectionConsent === true;
  const hasAudioConsent = hasDataConsent && userProfile?.audioRetentionConsent === true;

  const handleToggleDataConsent = () => {
    const next = !hasDataConsent;
    updateUserProfile({
      dataCollectionConsent: next,
      // Withdrawing data consent also withdraws the stricter audio consent.
      ...(next ? {} : { audioRetentionConsent: false }),
      consentUpdatedAt: new Date().toISOString(),
    });
  };

  const handleToggleAudioConsent = () => {
    if (!hasDataConsent) return;
    updateUserProfile({
      audioRetentionConsent: !hasAudioConsent,
      consentUpdatedAt: new Date().toISOString(),
    });
  };

  const handleImportToCloud = async () => {
    if (isImporting) return;
    const confirmed = window.confirm(
      "Copy this device's data to your account? This is one-way — your local data stays on this device and is not deleted."
    );
    if (!confirmed) return;
    setIsImporting(true);
    try {
      const counts = await importLocalDataToCloud();
      const total =
        counts.phrases +
        counts.sessions +
        counts.tags +
        counts.conversationLessons +
        counts.lessonProgress +
        counts.profile;
      toast.success(
        total === 0
          ? "Nothing new to import — your account already has this device's data."
          : `Imported ${counts.phrases} phrases, ${counts.sessions} sessions, ${counts.conversationLessons} lessons, ${counts.tags} tags.`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed. Please try again.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleCloudSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      localStorage.removeItem("ht_email_authed");
      toast.success("Signed out of your account.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to sign out. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  };

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
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") nameInputRef.current?.blur();
  };

  const handleEditNameClick = () => {
    setIsEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const activePersonaProfile = userProfile?.personaProfiles?.[activePersona];
  const personaSummary =
    activePersonaProfile?.personaSummary ??
    (activePersona === "personal" ? userProfile?.personaSummary : undefined);
  const characteristicPhrases =
    activePersonaProfile?.characteristicPhrases ??
    (activePersona === "personal" ? userProfile?.characteristicPhrases : undefined);

  const handleSelectPersona = (p: PersonaType) => {
    updateUserProfile({ activePersona: p });
  };

  return (
    <div className="flex flex-col h-full bg-background pb-20 overflow-y-auto scrollbar-none">
      {/* Header Profile Area */}
      <div className="shrink-0 bg-card px-6 pt-10 pb-6 border-b border-border text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-brand-blue/20 to-white/0 opacity-50 pointer-events-none"></div>
        <div className="w-24 h-24 bg-gradient-to-tr from-brand-blue to-brand-red rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-md relative z-10">
          <User size={40} className="text-white" />
          <div className="absolute bottom-0 right-0 bg-white rounded-full p-1 shadow-sm border border-border-subtle">
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
              className="text-2xl font-bold text-center text-foreground bg-transparent border-b-2 border-brand-blue focus:outline-none w-48"
            />
          ) : (
            <>
              <h1 className="text-2xl font-bold text-foreground">{userProfile?.name || "Your Persona"}</h1>
              <button
                onClick={handleEditNameClick}
                className="text-faint hover:text-brand-blue transition-colors"
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
            <User size={18} className="text-faint" />
            <h2 className="text-sm font-semibold text-foreground/90 uppercase tracking-wider">Active Persona</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleSelectPersona("personal")}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                activePersona === "personal"
                  ? "bg-brand-blue/10 border-brand-blue shadow-sm"
                  : "bg-card border-border-subtle hover:border-border"
              }`}
            >
              <Home
                size={24}
                className={activePersona === "personal" ? "text-brand-blue" : "text-faint"}
              />
              <span
                className={`font-semibold text-sm ${activePersona === "personal" ? "text-brand-blue" : "text-muted-foreground"}`}
              >
                Personal
              </span>
              <span className="text-xs text-faint text-center">Home & family conversations</span>
            </button>
            <button
              onClick={() => handleSelectPersona("work")}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                activePersona === "work"
                  ? "bg-brand-blue/10 border-brand-blue shadow-sm"
                  : "bg-card border-border-subtle hover:border-border"
              }`}
            >
              <Briefcase
                size={24}
                className={activePersona === "work" ? "text-brand-blue" : "text-faint"}
              />
              <span
                className={`font-semibold text-sm ${activePersona === "work" ? "text-brand-blue" : "text-muted-foreground"}`}
              >
                Work
              </span>
              <span className="text-xs text-faint text-center">Professional context</span>
            </button>
          </div>
        </section>

        {/* AI Personality Summary */}
        <section>
          <div className="bg-card rounded-3xl shadow-sm border border-brand-blue/15 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-brand-blue/10 to-brand-red/10 rounded-full -mr-10 -mt-10 blur-xl"></div>
            <div className="p-5 relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={18} className="text-brand-blue" />
                <h2 className="font-bold text-foreground">AI Vibe Analysis</h2>
              </div>
              <p className="text-xs text-faint mb-3">
                {activePersona === "personal" ? "Personal persona" : "Work persona"}
              </p>

              {personaSummary ? (
                <>
                  <p className="text-sm text-muted-foreground leading-relaxed">{personaSummary}</p>
                  {(characteristicPhrases?.length ?? 0) > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold text-faint uppercase tracking-wider mb-2">
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
                  <Brain size={32} className="text-faint mx-auto mb-3" />
                  <p className="text-sm text-faint leading-relaxed">
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
          <div className="bg-card rounded-2xl shadow-sm border border-border-subtle overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-faint" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Suggested Replies</p>
                  <p className="text-xs text-faint mt-0.5">
                    {userProfile?.suggestedRepliesEnabled !== false
                      ? "Showing reply suggestions in chat"
                      : "Suggestions hidden"}
                  </p>
                </div>
              </div>
              <button
                onClick={() =>
                  updateUserProfile({
                    suggestedRepliesEnabled: userProfile?.suggestedRepliesEnabled === false,
                  })
                }
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                  userProfile?.suggestedRepliesEnabled !== false ? "bg-brand-blue" : "bg-switch-background"
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

        {/* Appearance (theme preference; defaults to light until opted in) */}
        <section>
          <div className="flex items-center gap-2 mb-3 px-2">
            <SunMoon size={18} className="text-faint" />
            <h2 className="text-sm font-semibold text-foreground/90 uppercase tracking-wider">
              Appearance
            </h2>
          </div>
          <div className="flex bg-muted rounded-xl p-1">
            {(["light", "dark", "system"] as const).map((option) => (
              <button
                key={option}
                onClick={() => setTheme(option)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${
                  themePreference === option
                    ? "bg-card text-brand-blue shadow-sm"
                    : "text-muted-foreground hover:text-foreground/90"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </section>

        {/* Voice Selector — hidden for voice-less packs (no display voices) */}
        {displayVoices.length > 0 && (
          <section data-tour="profile-voice-selection">
            <div className="flex items-center gap-2 mb-3 px-2">
              <Volume2 size={18} className="text-faint" />
              <h2 className="text-sm font-semibold text-foreground/90 uppercase tracking-wider">Voice</h2>
            </div>

            {/* Voice tabs */}
            <div className="flex bg-muted rounded-xl p-1 mb-3">
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

            <div className="bg-card rounded-2xl shadow-sm border border-border-subtle overflow-hidden divide-y divide-border-subtle">
              {displayVoices
                .filter((v) => v.gender === voiceGenderTab)
                .map((voice) => {
                  const selected = (userProfile?.preferredVoiceId ?? displayVoices[0].key) === voice.key;
                  return (
                    <label
                      key={voice.key}
                      className="flex items-center p-4 cursor-pointer hover:bg-background transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className={`font-medium ${selected ? "text-brand-blue" : "text-foreground"}`}>
                            {voice.label}
                          </h3>
                        </div>
                      </div>
                      <button
                        onClick={(e) => handlePreview(e, voice.key)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mr-2 transition-colors ${
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
                      </button>
                      <div className="relative flex items-center justify-center w-6 h-6 shrink-0">
                        <input
                          type="radio"
                          name="voice"
                          value={voice.key}
                          checked={selected}
                          onChange={() => updateUserProfile({ preferredVoiceId: voice.key })}
                          className="peer appearance-none w-5 h-5 border-2 border-border rounded-full checked:border-brand-blue transition-colors cursor-pointer"
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
        )}

        {/* Replay Tour */}
        <section data-tour="profile-tour-replay">
          <div className="flex items-center gap-2 mb-3 px-2">
            <HelpCircle size={18} className="text-faint" />
            <h2 className="text-sm font-semibold text-foreground/90 uppercase tracking-wider">Replay Tour</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: "chat" as const, label: "Chat", icon: <MessageCircle size={20} />, path: "/" },
              { id: "learn" as const, label: "Learn", icon: <BookOpen size={20} />, path: "/learn" },
              {
                id: "bookmarks" as const,
                label: "Bookmarks",
                icon: <Bookmark size={20} />,
                path: "/bookmarks",
              },
              { id: "profile" as const, label: "Profile", icon: <User size={20} />, path: "/profile" },
            ].map((tour) => (
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
                className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border border-border-subtle shadow-sm hover:border-brand-blue/50 hover:bg-brand-blue/10 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-blue/10 flex items-center justify-center text-brand-blue">
                  {tour.icon}
                </div>
                <span className="text-sm font-semibold text-foreground/90">{tour.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Cloud Account */}
        {isCloudAuthEnabled && authUser && (
          <section>
            <div className="bg-card rounded-2xl shadow-sm border border-border-subtle overflow-hidden divide-y divide-border-subtle">
              <div className="flex items-center justify-between p-4 gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <User size={18} className="text-faint shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">Account</p>
                    <p className="text-xs text-faint mt-0.5 truncate">{authUser.email ?? "Signed in"}</p>
                  </div>
                </div>
                <button
                  onClick={handleCloudSignOut}
                  disabled={isSigningOut}
                  className="flex items-center gap-1.5 text-sm font-semibold text-red-500 hover:text-red-600 transition-colors disabled:opacity-60 shrink-0"
                >
                  {isSigningOut ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                  Sign out
                </button>
              </div>
              <div className="p-4">
                <button
                  onClick={handleImportToCloud}
                  disabled={isImporting}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-blue/10 text-brand-blue text-sm font-semibold hover:bg-brand-blue/15 transition-colors disabled:opacity-60"
                >
                  {isImporting ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                  {isImporting ? "Importing…" : "Import this device's data to your account"}
                </button>
                <p className="text-xs text-faint mt-2 text-center">
                  One-way copy — your local data is not deleted.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Data & privacy (ML data pipeline consent, docs/ML_PIPELINE.md) */}
        {isCloudAuthEnabled && authUser && (
          <section>
            <div className="flex items-center gap-2 mb-3 px-2">
              <ShieldCheck size={18} className="text-faint" />
              <h2 className="text-sm font-semibold text-foreground/90 uppercase tracking-wider">
                Data &amp; privacy
              </h2>
            </div>
            <div className="bg-card rounded-2xl shadow-sm border border-border-subtle overflow-hidden divide-y divide-border-subtle">
              <div className="flex items-center justify-between p-4 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Help improve dialect recognition</p>
                  <p className="text-xs text-faint mt-0.5">
                    Share your practice phrases, transcripts, corrections and scores to train better dialect
                    models — trained reviewers may review them to correct transcriptions
                  </p>
                </div>
                <button
                  onClick={handleToggleDataConsent}
                  aria-label="Toggle data collection consent"
                  className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${
                    hasDataConsent ? "bg-brand-blue" : "bg-switch-background"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                      hasDataConsent ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
              <div
                className={`flex items-center justify-between p-4 gap-3 ${hasDataConsent ? "" : "opacity-50"}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Also keep my recordings</p>
                  <p className="text-xs text-faint mt-0.5">
                    Additionally, your recordings may be securely stored and reviewed by trained reviewers to
                    improve speech recognition
                  </p>
                </div>
                <button
                  onClick={handleToggleAudioConsent}
                  disabled={!hasDataConsent}
                  aria-label="Toggle audio retention consent"
                  className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 disabled:cursor-not-allowed ${
                    hasAudioConsent ? "bg-brand-blue" : "bg-switch-background"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                      hasAudioConsent ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
            <p className="text-xs text-faint mt-2 px-2">
              Both are off by default. Withdrawing consent stops future collection; your data is deleted with
              your account.
            </p>
          </section>
        )}

        {/* Sign Out */}
        <div className="pt-4">
          <button
            onClick={() => setIsSignedIn(false)}
            className="w-full bg-card text-red-500 border border-red-100 font-semibold rounded-2xl py-4 shadow-sm hover:bg-red-50 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
