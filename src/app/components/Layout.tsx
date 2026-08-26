import React, { useState, useEffect, useRef, useCallback } from "react";
import { Outlet, NavLink } from "react-router";
import { MessageSquare, BookOpen, Bookmark, User, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthProvider";
import { useProfile } from "../context/ProfileProvider";
import { useTheme } from "../../hooks/useTheme";
import { SignInPage } from "../pages/SignInPage";
import { AuthPage } from "../pages/AuthPage";
import { OnboardingPage } from "../pages/OnboardingPage";
import { Toaster } from "sonner";
import { TourProvider } from "./tour/TourProvider";
import { TourOverlay } from "./tour/TourOverlay";
import { useTourAutoTrigger } from "./tour/useTourAutoTrigger";

const HAS_ACCESS_CODE = !!import.meta.env.VITE_ACCESS_CODE;

export function Layout() {
  const { isCloudAuthEnabled, authUser, authLoading } = useAuth();
  const { isSignedIn, userProfile, profileStatus, retryProfileLoad } = useProfile();
  // Resolved (not raw) theme: sonner's own "system" mode would follow the OS
  // even though the app defaults to light until the user opts in.
  const { resolvedTheme } = useTheme();
  const [isEmailAuthed, setIsEmailAuthedState] = useState(
    () => localStorage.getItem("ht_email_authed") === "true"
  );
  const setIsEmailAuthed = useCallback((val: boolean) => {
    localStorage.setItem("ht_email_authed", String(val));
    setIsEmailAuthedState(val);
  }, []);

  // When cloud auth is enabled, a live Supabase session passes the email gate
  // automatically; guests still pass via the local flag set by "Continue as Guest".
  const emailGatePassed = isEmailAuthed || (isCloudAuthEnabled && !!authUser);

  // When a cloud session ends (sign-out), return to the email gate. Guests are
  // unaffected: they never had a session, so this transition never fires for them.
  const hadCloudSession = useRef(false);
  useEffect(() => {
    if (!isCloudAuthEnabled) return;
    if (authUser) {
      hadCloudSession.current = true;
    } else if (hadCloudSession.current) {
      hadCloudSession.current = false;
      setIsEmailAuthed(false);
    }
  }, [isCloudAuthEnabled, authUser, setIsEmailAuthed]);

  // If no access code is configured, treat the gate as already passed
  const accessCodePassed = !HAS_ACCESS_CODE || isSignedIn;
  // A nameless profile only means "new user" once the load has settled. While
  // it is loading or failed, onboarding would overwrite a returning user's
  // stored profile with an empty one — so it stays unreachable until "loaded".
  const needsOnboarding =
    accessCodePassed && emailGatePassed && profileStatus === "loaded" && !userProfile?.name;

  // dark:bg-background keeps the desktop letterbox coherent in dark mode;
  // light mode keeps the original brand-white wash untouched.
  return (
    <div className="flex justify-center bg-brand-white dark:bg-background min-h-dvh">
      <div className="w-full max-w-[448px] bg-card h-dvh flex flex-col shadow-2xl relative overflow-hidden">
        {!accessCodePassed ? (
          <SignInPage />
        ) : !emailGatePassed ? (
          // Avoid flashing the sign-in form while an existing session restores.
          isCloudAuthEnabled && authLoading ? null : (
            <AuthPage onComplete={() => setIsEmailAuthed(true)} />
          )
        ) : profileStatus === "loading" ? (
          <ProfileLoadingScreen />
        ) : profileStatus === "error" ? (
          <ProfileLoadErrorScreen onRetry={retryProfileLoad} />
        ) : needsOnboarding ? (
          <OnboardingPage />
        ) : (
          <TourProvider>
            <AuthenticatedLayout />
          </TourProvider>
        )}
        <Toaster position="top-center" richColors theme={resolvedTheme} />
      </div>
    </div>
  );
}

function ProfileLoadingScreen() {
  return (
    <div className="flex-1 flex items-center justify-center" role="status" aria-label="Loading your profile">
      <Loader2 size={24} className="animate-spin text-faint" />
    </div>
  );
}

function ProfileLoadErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
      <p className="text-sm text-muted-foreground">Couldn't load your data.</p>
      <button
        type="button"
        onClick={onRetry}
        className="bg-brand-blue hover:bg-brand-blue/90 active:bg-brand-blue/80 text-white font-semibold rounded-xl px-6 py-3 transition-all"
      >
        Retry
      </button>
    </div>
  );
}

function AuthenticatedLayout() {
  useTourAutoTrigger();

  return (
    <>
      <div className="flex-1 overflow-y-auto pb-nav bg-brand-white dark:bg-background relative scrollbar-none">
        <Outlet />
      </div>

      <nav
        className="absolute bottom-0 w-full bg-card border-t border-border flex justify-around px-2 z-50"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <NavItem to="/" icon={<MessageSquare size={24} />} label="Chat" />
        <NavItem to="/learn" icon={<BookOpen size={24} />} label="Learn" />
        <NavItem to="/bookmarks" icon={<Bookmark size={24} />} label="Saved" />
        <NavItem to="/profile" icon={<User size={24} />} label="Profile" />
      </nav>

      <TourOverlay />
    </>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center w-full h-16 gap-1 transition-colors ${
          isActive ? "text-brand-blue" : "text-faint hover:text-muted-foreground"
        }`
      }
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </NavLink>
  );
}
