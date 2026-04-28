import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { repositories } from "../../repositories";
import type { Tone, Phrase, Message, Session, UserProfile, LessonProgress } from "../../types";
import { updatePersona } from "../../services/personaService";

export type { Tone, Phrase, Message, Session };

const DEFAULT_PHRASES: Phrase[] = [
  {
    id: "1",
    original: "Hello, how are you?",
    dialect: "你好嗎？",
    pronunciation: "nei5 hou2 maa1?",
    isBookmarked: true,
    context: "General greeting",
  },
  {
    id: "2",
    original: "I don't understand.",
    dialect: "我唔明。",
    pronunciation: "ngo5 m4 ming4.",
    isBookmarked: false,
    context: "When confused",
  },
];

interface AppContextType {
  dialect: string;
  setDialect: (d: string) => void;
  tone: Tone;
  setTone: (t: Tone) => void;
  phrases: Phrase[];
  toggleBookmark: (id: string) => void;
  messages: Message[];
  addMessage: (msg: Message) => void;
  clearMessages: () => void;
  addBotSuggestions: (transcript: string, suggestions: Phrase[]) => void;
  learnedCount: number;
  incrementLearned: () => void;
  isSignedIn: boolean;
  setIsSignedIn: (val: boolean) => void;
  sessions: Session[];
  saveSession: (messages: Message[]) => void;
  renameSession: (id: string, title: string) => void;
  deleteSession: (id: string) => void;
  discardChat: (messages: Message[]) => void;
  addTranslation: (originalText: string, phrase: Phrase) => void;
  userProfile: UserProfile | null;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
  lessonProgress: Record<string, LessonProgress>;
  updateLessonProgress: (progress: LessonProgress) => void;
  addPhrase: (phrase: Phrase) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [dialect, setDialect] = useState("Cantonese");
  const [tone, setToneState] = useState<Tone>("casual");

  const setTone = (t: Tone) => {
    setToneState(t);
    setUserProfile((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, preferredTone: t, updatedAt: new Date().toISOString() };
      repositories.user.saveProfile(updated);
      return updated;
    });
  };

  const [phrases, setPhrases] = useState<Phrase[]>(DEFAULT_PHRASES);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [learnedCount, setLearnedCount] = useState(12);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [lessonProgress, setLessonProgress] = useState<Record<string, LessonProgress>>({});

  useEffect(() => {
    Promise.all([
      repositories.phrases.getAll(),
      repositories.conversations.getAll(),
      repositories.user.getProfile(),
      repositories.lessons.getAllProgress(),
    ]).then(([p, s, u, lp]) => {
      setPhrases(p);
      setSessions(s);
      setUserProfile(u);
      setLessonProgress(lp);
      if (u?.preferredTone) setTone(u.preferredTone);
    });
  }, []);

  const toggleBookmark = (id: string) => {
    setPhrases((prev) => {
      const updated = prev.map((p) =>
        p.id === id ? { ...p, isBookmarked: !p.isBookmarked } : p
      );
      repositories.phrases.saveAll(updated);
      return updated;
    });
  };

  const addMessage = (msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  };

  const clearMessages = () => setMessages([]);

  const updatePersonaInBackground = (msgs: Message[], profile: UserProfile | null) => {
    const now = new Date().toISOString();
    const effectiveProfile: UserProfile = profile ?? {
      id: Date.now().toString(),
      name: "",
      preferredDialect: "Cantonese",
      preferredTone: "casual",
      personalityNotes: "",
      conversationCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    updatePersona(msgs, effectiveProfile).then((result) => {
      if (result) {
        setUserProfile((prev) => {
          const base = prev ?? effectiveProfile;
          const updated: UserProfile = {
            ...base,
            personaSummary: result.personaSummary,
            characteristicPhrases: result.characteristicPhrases,
            updatedAt: new Date().toISOString(),
          };
          repositories.user.saveProfile(updated);
          return updated;
        });
      }
    });
  };

  const saveSession = (msgs: Message[]) => {
    const newSession: Session = {
      id: Date.now().toString(),
      date: new Date().toLocaleDateString(),
      messages: msgs,
    };
    setSessions((prev) => [newSession, ...prev]);
    repositories.conversations.addSession(newSession);
    updatePersonaInBackground(msgs, userProfile);
    setMessages([]);
  };

  const renameSession = (id: string, title: string) => {
    setSessions((prev) => {
      const updated = prev.map((s) => s.id === id ? { ...s, title } : s);
      const session = updated.find((s) => s.id === id);
      if (session) repositories.conversations.updateSession(session);
      return updated;
    });
  };

  const deleteSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    repositories.conversations.deleteSession(id);
  };

  const discardChat = (msgs: Message[]) => {
    updatePersonaInBackground(msgs, userProfile);
    setMessages([]);
  };

  const addBotSuggestions = (transcript: string, suggestions: Phrase[]) => {
    setPhrases((prev) => {
      const updated = [...prev];
      suggestions.forEach((s) => {
        if (!updated.find((p) => p.id === s.id)) {
          updated.push({ ...s, isBookmarked: false });
        }
      });
      repositories.phrases.saveAll(updated);
      return updated;
    });

    const msg: Message = {
      id: Date.now().toString(),
      sender: "bot",
      text: transcript ? `Translating: "${transcript}"` : "Here are some ways to say that:",
      suggestions,
    };
    addMessage(msg);
  };

  const addTranslation = (originalText: string, phrase: Phrase) => {
    setPhrases((prev) => {
      if (prev.find((p) => p.id === phrase.id)) return prev;
      const updated = [...prev, { ...phrase, isBookmarked: false }];
      repositories.phrases.saveAll(updated);
      return updated;
    });
    const msg: Message = {
      id: Date.now().toString(),
      sender: "bot",
      text: phrase.dialect,
      cantoneseText: phrase.dialect,
      pronunciation: phrase.pronunciation,
      context: phrase.context,
      phraseId: phrase.id,
    };
    setMessages((prev) => [...prev, msg]);
  };

  const incrementLearned = () => {
    setLearnedCount((prev) => prev + 1);
  };

  const updateUserProfile = (updates: Partial<UserProfile>) => {
    setUserProfile((prev) => {
      const now = new Date().toISOString();
      const updated: UserProfile = prev
        ? { ...prev, ...updates, updatedAt: now }
        : {
            id: Date.now().toString(),
            name: "",
            preferredDialect: "Cantonese",
            preferredTone: "casual",
            personalityNotes: "",
            conversationCount: 0,
            createdAt: now,
            updatedAt: now,
            ...updates,
          };
      repositories.user.saveProfile(updated);
      return updated;
    });
  };

  const updateLessonProgress = (progress: LessonProgress) => {
    setLessonProgress((prev) => ({ ...prev, [progress.lessonId]: progress }));
    repositories.lessons.updateProgress(progress);
  };

  const addPhrase = (phrase: Phrase) => {
    setPhrases((prev) => {
      if (prev.find((p) => p.id === phrase.id)) return prev;
      const updated = [...prev, { ...phrase, isBookmarked: false }];
      repositories.phrases.saveAll(updated);
      return updated;
    });
  };

  return (
    <AppContext.Provider
      value={{
        dialect,
        setDialect,
        tone,
        setTone,
        phrases,
        toggleBookmark,
        messages,
        addMessage,
        clearMessages,
        addBotSuggestions,
        learnedCount,
        incrementLearned,
        isSignedIn,
        setIsSignedIn,
        sessions,
        saveSession,
        renameSession,
        deleteSession,
        discardChat,
        addTranslation,
        userProfile,
        updateUserProfile,
        lessonProgress,
        updateLessonProgress,
        addPhrase,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
};
