import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { repositories } from "../../repositories";
import { db } from "../../repositories/local/db";
import type { Tone, Phrase, Message, Session, UserProfile, LessonProgress, ConversationLesson, PersonaType, Tag, TagType } from "../../types";
import { updatePersona } from "../../services/personaService";
import { newId } from "../../utils/id";

export type { Tone, Phrase, Message, Session, ConversationLesson, PersonaType, Tag, TagType };

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
  tags: Tag[];
  phraseTags: Tag[];
  sessionTags: Tag[];
  createTag: (name: string, type: TagType) => Tag;
  deleteTag: (id: string) => void;
  setPhraseTags: (phraseId: string, tagIds: string[]) => void;
  setSessionTags: (sessionId: string, tagIds: string[]) => void;
  saveSession: (messages: Message[], title: string, tags?: string[]) => void;
  renameSession: (id: string, title: string) => void;
  deleteSession: (id: string) => void;
  deleteSessionMessage: (sessionId: string, messageId: string) => void;
  discardChat: (messages: Message[]) => void;
  conversationLessons: ConversationLesson[];
  saveConversationLesson: (lesson: ConversationLesson) => void;
  updateConversationLesson: (lesson: ConversationLesson) => void;
  deleteConversationLesson: (id: string) => void;
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

  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [conversationLessons, setConversationLessons] = useState<ConversationLesson[]>([]);
  const [learnedCount, setLearnedCount] = useState(12);
  const [isSignedIn, setIsSignedInState] = useState(() => localStorage.getItem("ht_signed_in") === "true");
  const setIsSignedIn = (val: boolean) => {
    localStorage.setItem("ht_signed_in", String(val));
    setIsSignedInState(val);
  };
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [lessonProgress, setLessonProgress] = useState<Record<string, LessonProgress>>({});
  const [tags, setTags] = useState<Tag[]>([]);

  const activePersona: PersonaType = userProfile?.activePersona ?? "personal";
  const activePersonaProfile = userProfile?.personaProfiles?.[activePersona];
  const tone: Tone = activePersonaProfile?.tone ?? userProfile?.preferredTone ?? "casual";

  useEffect(() => {
    document.documentElement.style.setProperty("--font-size", "18px");
  }, []);

  useEffect(() => {
    Promise.all([
      repositories.phrases.getAll(),
      repositories.conversations.getAll(),
      repositories.user.getProfile(),
      repositories.lessons.getAllProgress(),
      repositories.conversationLessons.getAll(),
      db.draftMessages.get("draft"),
      repositories.tags.getAll(),
    ]).then(([p, s, u, lp, cl, draft, t]) => {
      setPhrases(p);
      setSessions(s);
      setUserProfile(u);
      setLessonProgress(lp);
      setConversationLessons(cl);
      if (draft && draft.messages.length > 0) setMessages(draft.messages);
      setTags(t);
    }).catch((err) => {
      console.error("Failed to load saved data from local storage:", err);
    });
  }, []);

  useEffect(() => {
    if (messages.length === 0) {
      db.draftMessages.delete("draft").catch(() => {});
    } else {
      db.draftMessages.put({ key: "draft", messages }).catch(() => {});
    }
  }, [messages]);

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
      id: newId(),
      name: "",
      preferredDialect: "Cantonese",
      preferredTone: "casual",
      toneOverrideEnabled: false,
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

  const phraseTags = tags.filter((t) => t.type === "phrase");
  const sessionTags = tags.filter((t) => t.type === "session");

  const createTag = (name: string, type: TagType): Tag => {
    const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase() && t.type === type);
    if (existing) return existing;
    const tag: Tag = { id: newId(), name, type, createdAt: new Date().toISOString() };
    setTags((prev) => [...prev, tag]);
    repositories.tags.create(tag);
    return tag;
  };

  const deleteTag = (id: string) => {
    setTags((prev) => prev.filter((t) => t.id !== id));
    repositories.tags.delete(id);
    setPhrases((prev) => {
      const updated = prev.map((p) =>
        p.tags?.includes(id) ? { ...p, tags: p.tags.filter((t) => t !== id) } : p
      );
      repositories.phrases.saveAll(updated);
      return updated;
    });
    setSessions((prev) =>
      prev.map((s) => {
        if (!s.tags?.includes(id)) return s;
        const updated = { ...s, tags: s.tags.filter((t) => t !== id) };
        repositories.conversations.updateSession(updated);
        return updated;
      })
    );
  };

  const setPhraseTags = (phraseId: string, tagIds: string[]) => {
    setPhrases((prev) => {
      const updated = prev.map((p) =>
        p.id === phraseId ? { ...p, tags: tagIds, isBookmarked: tagIds.length > 0 || p.isBookmarked } : p
      );
      repositories.phrases.saveAll(updated);
      return updated;
    });
  };

  const setSessionTags = (sessionId: string, tagIds: string[]) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        const updated = { ...s, tags: tagIds };
        repositories.conversations.updateSession(updated);
        return updated;
      })
    );
  };

  const saveSession = (msgs: Message[], title: string, sessionTags?: string[]) => {
    const newSession: Session = {
      id: newId(),
      title,
      date: new Date().toLocaleDateString(),
      createdAt: new Date().toISOString(),
      messages: msgs,
      persona: activePersona,
      tags: sessionTags,
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
    setConversationLessons((prev) =>
      prev.map((l) => {
        if (l.sessionId !== id) return l;
        const updated = { ...l, title };
        repositories.conversationLessons.update(updated);
        return updated;
      })
    );
  };

  const deleteSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    repositories.conversations.deleteSession(id);
  };

  const deleteSessionMessage = (sessionId: string, messageId: string) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        const updated = { ...s, messages: s.messages.filter((m) => m.id !== messageId) };
        repositories.conversations.updateSession(updated);
        return updated;
      })
    );
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
      id: messageId ?? newId(),
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
      id: newId(),
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
            id: newId(),
            name: "",
            preferredDialect: "Cantonese",
            preferredTone: "casual",
            toneOverrideEnabled: false,
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
      const withTimestamp = { ...phrase, createdAt: phrase.createdAt ?? new Date().toISOString() };
      const updated = [...prev, withTimestamp];
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

  const deleteConversationLesson = (id: string) => {
    setConversationLessons((prev) => prev.filter((l) => l.id !== id));
    repositories.conversationLessons.delete(id);
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
        deleteSessionMessage,
        discardChat,
        conversationLessons,
        saveConversationLesson,
        updateConversationLesson,
        deleteConversationLesson,
        addTranslation,
        userProfile,
        updateUserProfile,
        lessonProgress,
        updateLessonProgress,
        addPhrase,
        updatePhrase,
        updateMessage,
        removeMessage,
        tags,
        phraseTags,
        sessionTags,
        createTag,
        deleteTag,
        setPhraseTags,
        setSessionTags,
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
