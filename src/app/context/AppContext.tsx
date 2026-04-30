import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { repositories } from "../../repositories";
import type { Tone, Phrase, Message, Session, UserProfile, LessonProgress, ConversationLesson, PersonaType } from "../../types";
import { updatePersona } from "../../services/personaService";

export type { Tone, Phrase, Message, Session, ConversationLesson, PersonaType };

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
  activePersona: PersonaType;
  tone: Tone;
  setTone: (t: Tone) => void;
  phrases: Phrase[];
  toggleBookmark: (id: string) => void;
  messages: Message[];
  addMessage: (msg: Message) => void;
  clearMessages: () => void;
  addBotSuggestions: (transcript: string, suggestions: Phrase[], messageId?: string) => void;
  learnedCount: number;
  incrementLearned: () => void;
  isSignedIn: boolean;
  setIsSignedIn: (val: boolean) => void;
  sessions: Session[];
  saveSession: (messages: Message[], title: string) => void;
  renameSession: (id: string, title: string) => void;
  deleteSession: (id: string) => void;
  discardChat: (messages: Message[]) => void;
  conversationLessons: ConversationLesson[];
  saveConversationLesson: (lesson: ConversationLesson) => void;
  updateConversationLesson: (lesson: ConversationLesson) => void;
  addTranslation: (originalText: string, phrase: Phrase) => void;
  userProfile: UserProfile | null;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
  lessonProgress: Record<string, LessonProgress>;
  updateLessonProgress: (progress: LessonProgress) => void;
  addPhrase: (phrase: Phrase) => void;
  updatePhrase: (phrase: Phrase) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  removeMessage: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [dialect, setDialect] = useState("Cantonese");

  const [phrases, setPhrases] = useState<Phrase[]>(DEFAULT_PHRASES);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [conversationLessons, setConversationLessons] = useState<ConversationLesson[]>([]);
  const [learnedCount, setLearnedCount] = useState(12);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [lessonProgress, setLessonProgress] = useState<Record<string, LessonProgress>>({});

  const activePersona: PersonaType = userProfile?.activePersona ?? "personal";
  const activePersonaProfile = userProfile?.personaProfiles?.[activePersona];
  const tone: Tone = activePersonaProfile?.tone ?? userProfile?.preferredTone ?? "casual";

  useEffect(() => {
    Promise.all([
      repositories.phrases.getAll(),
      repositories.conversations.getAll(),
      repositories.user.getProfile(),
      repositories.lessons.getAllProgress(),
      repositories.conversationLessons.getAll(),
    ]).then(([p, s, u, lp, cl]) => {
      setPhrases(p);
      setSessions(s);
      setUserProfile(u);
      setLessonProgress(lp);
      setConversationLessons(cl);
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

  const updatePersonaInBackground = (msgs: Message[], profile: UserProfile | null, persona: PersonaType) => {
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
          const existingPersonaProfile = base.personaProfiles?.[persona];
          const updated: UserProfile = {
            ...base,
            personaProfiles: {
              ...base.personaProfiles,
              [persona]: {
                ...existingPersonaProfile,
                personaSummary: result.personaSummary,
                characteristicPhrases: result.characteristicPhrases,
                tone: existingPersonaProfile?.tone ?? base.preferredTone ?? "casual",
              },
            },
            ...(persona === "personal" ? {
              personaSummary: result.personaSummary,
              characteristicPhrases: result.characteristicPhrases,
            } : {}),
            updatedAt: new Date().toISOString(),
          };
          repositories.user.saveProfile(updated);
          return updated;
        });
      }
    });
  };

  const saveSession = (msgs: Message[], title: string) => {
    const newSession: Session = {
      id: Date.now().toString(),
      title,
      date: new Date().toLocaleDateString(),
      messages: msgs,
      persona: activePersona,
    };
    setSessions((prev) => [newSession, ...prev]);
    repositories.conversations.addSession(newSession);
    updatePersonaInBackground(msgs, userProfile, activePersona);
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
    updatePersonaInBackground(msgs, userProfile, activePersona);
    setMessages([]);
  };

  const addBotSuggestions = (transcript: string, suggestions: Phrase[], messageId?: string) => {
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
      id: messageId ?? Date.now().toString(),
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

  const setTone = (t: Tone) => {
    updateUserProfile({
      preferredTone: t,
      personaProfiles: {
        ...userProfile?.personaProfiles,
        [activePersona]: { ...activePersonaProfile, tone: t },
      },
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

  const updatePhrase = (phrase: Phrase) => {
    setPhrases((prev) => {
      const updated = prev.map((p) => (p.id === phrase.id ? phrase : p));
      repositories.phrases.saveAll(updated);
      return updated;
    });
  };

  const updateMessage = (id: string, updates: Partial<Message>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));
  };

  const removeMessage = (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  const saveConversationLesson = (lesson: ConversationLesson) => {
    setConversationLessons((prev) => [...prev, lesson]);
    repositories.conversationLessons.save(lesson);
  };

  const updateConversationLesson = (lesson: ConversationLesson) => {
    setConversationLessons((prev) => prev.map((l) => (l.id === lesson.id ? lesson : l)));
    repositories.conversationLessons.update(lesson);
  };

  return (
    <AppContext.Provider
      value={{
        dialect,
        setDialect,
        activePersona,
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
        conversationLessons,
        saveConversationLesson,
        updateConversationLesson,
        addTranslation,
        userProfile,
        updateUserProfile,
        lessonProgress,
        updateLessonProgress,
        addPhrase,
        updatePhrase,
        updateMessage,
        removeMessage,
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
