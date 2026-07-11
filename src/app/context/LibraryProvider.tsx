import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { repositories, isCloudStorageMode } from "../../repositories";
import type { Phrase, Session, LessonProgress, ConversationLesson, Tag, TagType } from "../../types";
import { newId } from "../../utils/id";
import { useAuth } from "./AuthProvider";

interface LibraryContextType {
  phrases: Phrase[];
  addPhrase: (phrase: Phrase) => void;
  updatePhrase: (phrase: Phrase) => void;
  toggleBookmark: (id: string) => void;
  mergeSuggestedPhrases: (suggestions: Phrase[]) => void;
  addTranslationPhrase: (phrase: Phrase) => void;
  tags: Tag[];
  phraseTags: Tag[];
  sessionTags: Tag[];
  createTag: (name: string, type: TagType) => Tag;
  deleteTag: (id: string) => void;
  setPhraseTags: (phraseId: string, tagIds: string[]) => void;
  setSessionTags: (sessionId: string, tagIds: string[]) => void;
  sessions: Session[];
  addSessionRecord: (session: Session) => void;
  renameSession: (id: string, title: string) => void;
  deleteSession: (id: string) => void;
  deleteSessionMessage: (sessionId: string, messageId: string) => void;
  conversationLessons: ConversationLesson[];
  saveConversationLesson: (lesson: ConversationLesson) => void;
  updateConversationLesson: (lesson: ConversationLesson) => void;
  deleteConversationLesson: (id: string) => void;
  lessonProgress: Record<string, LessonProgress>;
  updateLessonProgress: (progress: LessonProgress) => void;
  learnedCount: number;
  incrementLearned: () => void;
}

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

export const LibraryProvider = ({ children }: { children: ReactNode }) => {
  const { authEpoch } = useAuth();
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [conversationLessons, setConversationLessons] = useState<ConversationLesson[]>([]);
  const [learnedCount, setLearnedCount] = useState(12);
  const [lessonProgress, setLessonProgress] = useState<Record<string, LessonProgress>>({});
  const [tags, setTags] = useState<Tag[]>([]);

  // In cloud storage mode the initial load must re-run when the auth session
  // changes (data is per-user); in local mode this stays a constant 0 so the
  // effect runs exactly once, as before.
  const reloadEpoch = isCloudStorageMode ? authEpoch : 0;

  useEffect(() => {
    void reloadEpoch;
    Promise.all([
      repositories.phrases.getAll(),
      repositories.conversations.getAll(),
      repositories.lessons.getAllProgress(),
      repositories.conversationLessons.getAll(),
      repositories.tags.getAll(),
    ])
      .then(([p, s, lp, cl, t]) => {
        setPhrases(p);
        setSessions(s);
        setLessonProgress(lp);
        setConversationLessons(cl);
        setTags(t);
      })
      .catch((err) => {
        console.error("Failed to load saved data from local storage:", err);
      });
  }, [reloadEpoch]);

  const toggleBookmark = useCallback((id: string) => {
    setPhrases((prev) => {
      const updated = prev.map((p) => (p.id === id ? { ...p, isBookmarked: !p.isBookmarked } : p));
      repositories.phrases.saveAll(updated);
      return updated;
    });
  }, []);

  const addPhrase = useCallback((phrase: Phrase) => {
    setPhrases((prev) => {
      if (prev.find((p) => p.id === phrase.id)) return prev;
      const withTimestamp = { ...phrase, createdAt: phrase.createdAt ?? new Date().toISOString() };
      const updated = [...prev, withTimestamp];
      repositories.phrases.saveAll(updated);
      return updated;
    });
  }, []);

  const updatePhrase = useCallback((phrase: Phrase) => {
    setPhrases((prev) => {
      const updated = prev.map((p) => (p.id === phrase.id ? phrase : p));
      repositories.phrases.saveAll(updated);
      return updated;
    });
  }, []);

  const mergeSuggestedPhrases = useCallback((suggestions: Phrase[]) => {
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
  }, []);

  const addTranslationPhrase = useCallback((phrase: Phrase) => {
    setPhrases((prev) => {
      if (prev.find((p) => p.id === phrase.id)) return prev;
      const updated = [...prev, { ...phrase, isBookmarked: false }];
      repositories.phrases.saveAll(updated);
      return updated;
    });
  }, []);

  const phraseTags = useMemo(() => tags.filter((t) => t.type === "phrase"), [tags]);
  const sessionTags = useMemo(() => tags.filter((t) => t.type === "session"), [tags]);

  const createTag = useCallback(
    (name: string, type: TagType): Tag => {
      const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase() && t.type === type);
      if (existing) return existing;
      const tag: Tag = { id: newId(), name, type, createdAt: new Date().toISOString() };
      setTags((prev) => [...prev, tag]);
      repositories.tags.create(tag);
      return tag;
    },
    [tags]
  );

  const deleteTag = useCallback((id: string) => {
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
  }, []);

  const setPhraseTags = useCallback((phraseId: string, tagIds: string[]) => {
    setPhrases((prev) => {
      const updated = prev.map((p) =>
        p.id === phraseId ? { ...p, tags: tagIds, isBookmarked: tagIds.length > 0 || p.isBookmarked } : p
      );
      repositories.phrases.saveAll(updated);
      return updated;
    });
  }, []);

  const setSessionTags = useCallback((sessionId: string, tagIds: string[]) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        const updated = { ...s, tags: tagIds };
        repositories.conversations.updateSession(updated);
        return updated;
      })
    );
  }, []);

  const addSessionRecord = useCallback((session: Session) => {
    setSessions((prev) => [session, ...prev]);
    repositories.conversations.addSession(session);
  }, []);

  const renameSession = useCallback((id: string, title: string) => {
    setSessions((prev) => {
      const updated = prev.map((s) => (s.id === id ? { ...s, title } : s));
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
  }, []);

  const deleteSession = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    repositories.conversations.deleteSession(id);
  }, []);

  const deleteSessionMessage = useCallback((sessionId: string, messageId: string) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        const updated = { ...s, messages: s.messages.filter((m) => m.id !== messageId) };
        repositories.conversations.updateSession(updated);
        return updated;
      })
    );
  }, []);

  const saveConversationLesson = useCallback((lesson: ConversationLesson) => {
    setConversationLessons((prev) => [...prev, lesson]);
    repositories.conversationLessons.save(lesson);
  }, []);

  const updateConversationLesson = useCallback((lesson: ConversationLesson) => {
    setConversationLessons((prev) => prev.map((l) => (l.id === lesson.id ? lesson : l)));
    repositories.conversationLessons.update(lesson);
  }, []);

  const deleteConversationLesson = useCallback((id: string) => {
    setConversationLessons((prev) => prev.filter((l) => l.id !== id));
    repositories.conversationLessons.delete(id);
  }, []);

  const updateLessonProgress = useCallback((progress: LessonProgress) => {
    setLessonProgress((prev) => ({ ...prev, [progress.lessonId]: progress }));
    repositories.lessons.updateProgress(progress);
  }, []);

  const incrementLearned = useCallback(() => {
    setLearnedCount((prev) => prev + 1);
  }, []);

  const value = useMemo(
    () => ({
      phrases,
      addPhrase,
      updatePhrase,
      toggleBookmark,
      mergeSuggestedPhrases,
      addTranslationPhrase,
      tags,
      phraseTags,
      sessionTags,
      createTag,
      deleteTag,
      setPhraseTags,
      setSessionTags,
      sessions,
      addSessionRecord,
      renameSession,
      deleteSession,
      deleteSessionMessage,
      conversationLessons,
      saveConversationLesson,
      updateConversationLesson,
      deleteConversationLesson,
      lessonProgress,
      updateLessonProgress,
      learnedCount,
      incrementLearned,
    }),
    [
      phrases,
      addPhrase,
      updatePhrase,
      toggleBookmark,
      mergeSuggestedPhrases,
      addTranslationPhrase,
      tags,
      phraseTags,
      sessionTags,
      createTag,
      deleteTag,
      setPhraseTags,
      setSessionTags,
      sessions,
      addSessionRecord,
      renameSession,
      deleteSession,
      deleteSessionMessage,
      conversationLessons,
      saveConversationLesson,
      updateConversationLesson,
      deleteConversationLesson,
      lessonProgress,
      updateLessonProgress,
      learnedCount,
      incrementLearned,
    ]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
};

export const useLibrary = () => {
  const context = useContext(LibraryContext);
  if (context === undefined) {
    throw new Error("useLibrary must be used within a LibraryProvider");
  }
  return context;
};
