import React, { useState, useRef } from "react";
import { User, Sparkles, Brain, Pencil } from "lucide-react";
import type { UserProfile } from "../../../types";

interface ProfileHeaderProps {
  userProfile: UserProfile | null;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
  personaSummary: string | undefined;
}

/** Header profile area: avatar, inline name editing, and the persona badge. */
export function ProfileHeader({ userProfile, updateUserProfile, personaSummary }: ProfileHeaderProps) {
  const [nameInput, setNameInput] = useState(userProfile?.name ?? "");
  const [isEditingName, setIsEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleNameBlur = () => {
    const trimmed = nameInput.trim();
    const currentName = userProfile?.name ?? "";
    if (!trimmed) {
      // Clearing the field and tapping away is an abandoned edit, not a
      // request to be nameless: persisting "" wiped the stored name and left
      // the header on its placeholder with no way back. Restore the draft.
      setNameInput(currentName);
    } else if (trimmed !== currentName) {
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

  return (
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
  );
}
