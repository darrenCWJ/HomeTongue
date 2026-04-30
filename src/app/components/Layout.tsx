import React, { useState } from "react";
import { Outlet, NavLink } from "react-router";
import { MessageSquare, BookOpen, Bookmark, User } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { SignInPage } from "../pages/SignInPage";
import { AuthPage } from "../pages/AuthPage";
import { OnboardingPage } from "../pages/OnboardingPage";
import { Toaster } from "sonner";

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
    <div className="flex justify-center bg-zinc-100 min-h-screen">
      <div className="w-full max-w-[448px] bg-white h-screen flex flex-col shadow-2xl relative overflow-hidden">
        {!accessCodePassed ? (
          <SignInPage />
        ) : !isEmailAuthed ? (
          <AuthPage onComplete={() => setIsEmailAuthed(true)} />
        ) : needsOnboarding ? (
          <OnboardingPage />
        ) : (
          <>
            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto pb-16 bg-zinc-50 relative">
              <Outlet />
            </div>

            {/* Bottom Navigation */}
            <nav className="absolute bottom-0 w-full bg-white border-t border-zinc-200 flex justify-around items-center h-16 px-2 z-50">
              <NavItem to="/" icon={<MessageSquare size={24} />} label="Chat" />
              <NavItem to="/learn" icon={<BookOpen size={24} />} label="Learn" />
              <NavItem to="/bookmarks" icon={<Bookmark size={24} />} label="Saved" />
              <NavItem to="/profile" icon={<User size={24} />} label="Profile" />
            </nav>
          </>
        )}
        <Toaster position="top-center" richColors />
      </div>
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
          isActive ? "text-indigo-600" : "text-zinc-400 hover:text-zinc-600"
        }`
      }
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </NavLink>
  );
}
