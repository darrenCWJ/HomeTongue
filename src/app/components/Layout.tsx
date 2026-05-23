import React, { useState } from "react";
import { Outlet, NavLink } from "react-router";
import { MessageSquare, BookOpen, Bookmark, User } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { SignInPage } from "../pages/SignInPage";
import { AuthPage } from "../pages/AuthPage";
import { OnboardingPage } from "../pages/OnboardingPage";
import { Toaster } from "sonner";
import { TourProvider } from "./tour/TourProvider";
import { TourOverlay } from "./tour/TourOverlay";
import { useTourAutoTrigger } from "./tour/useTourAutoTrigger";

const HAS_ACCESS_CODE = !!import.meta.env.VITE_ACCESS_CODE;

export function Layout() {
  const { isSignedIn, userProfile } = useAppContext();
  const [isEmailAuthed, setIsEmailAuthedState] = useState(() => localStorage.getItem("ht_email_authed") === "true");
  const setIsEmailAuthed = (val: boolean) => {
    localStorage.setItem("ht_email_authed", String(val));
    setIsEmailAuthedState(val);
  };

  // If no access code is configured, treat the gate as already passed
  const accessCodePassed = !HAS_ACCESS_CODE || isSignedIn;
  const needsOnboarding = accessCodePassed && isEmailAuthed && !userProfile?.name;

  return (
    <div className="flex justify-center bg-brand-white min-h-dvh">
      <div className="w-full max-w-[448px] bg-white h-dvh flex flex-col shadow-2xl relative overflow-hidden">
        {!accessCodePassed ? (
          <SignInPage />
        ) : !isEmailAuthed ? (
          <AuthPage onComplete={() => setIsEmailAuthed(true)} />
        ) : needsOnboarding ? (
          <OnboardingPage />
        ) : (
          <TourProvider>
            <AuthenticatedLayout />
          </TourProvider>
        )}
        <Toaster position="top-center" richColors />
      </div>
    </div>
  );
}

function AuthenticatedLayout() {
  useTourAutoTrigger();

  return (
    <>
      <div className="flex-1 overflow-y-auto pb-nav bg-brand-white relative scrollbar-none">
        <Outlet />
      </div>

      <nav className="absolute bottom-0 w-full bg-white border-t border-zinc-200 flex justify-around px-2 z-50"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
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
          isActive ? "text-brand-blue" : "text-zinc-400 hover:text-zinc-600"
        }`
      }
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </NavLink>
  );
}
