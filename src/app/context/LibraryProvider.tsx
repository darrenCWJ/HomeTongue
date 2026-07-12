import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import { repositories, isCloudStorageMode, setCloudWriteHold } from "../../repositories";
import type { Phrase, Session, LessonProgress, ConversationLesson, Tag, TagType } from "../../types";
import { newId } from "../../utils/id";
import { useAuth } from "./AuthProvider";
import { useSyncToasts } from "../../lib/useSyncToasts";

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
}

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

export const LibraryProvider = ({ children }: { children: ReactNode }) => {
  const { authEpoch } = useAuth();
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [conversationLessons, setConversationLessons] = useState<ConversationLesson[]>([]);
  const [lessonProgress, setLessonProgress] = useState<Record<string, LessonProgress>>({});
  const [tags, setTags] = useState<Tag[]>([]);

  // Set when the initial load rejects. While true, mutations keep updating
  // the in-memory state (UI stays usable) but never reach the backing store
  // directly — an unhydrated state must not overwrite real stored data.
  // Guard ownership: in LOCAL mode this guard owns everything (writes are
  // skipped, memory-only, as before). In CLOUD mode it only decides WHEN
  // writes may hit the network; the outbox (src/repositories/outbox/) owns
  // durability — load failure puts it in hold mode so writes queue locally,
  // and a later successful load clears the hold and flushes the queue.
  // A ref (not state) so the stable `persist` callback reads the latest value.
  const loadFailedRef = useRef(false);

  // Surface outbox events (queued / synced / dropped) as toasts.
  useSyncToasts();

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
        loadFailedRef.current = false;
        // Hydrated: cloud writes may flow again; held writes flush now.
        setCloudWriteHold(false);
        setPhrases(p);
        setSessions(s);
        setLessonProgress(lp);
        setConversationLessons(cl);
        setTags(t);
      })
      .catch((err) => {
        loadFailedRef.current = true;
        // Cloud: capture writes durably in the outbox instead (no-op locally).
        setCloudWriteHold(true);
        console.error(
          "[library] initial load failed — direct persistence disabled to protect stored data:",
          err
        );
      });
  }, [reloadEpoch]);

  /**
   * Run a single repository write with error handling. After a failed load:
   * local mode skips the write entirely; cloud mode still runs it because the
   * outbox is in hold mode and queues it locally (see loadFailedRef above).
   */
  const persist = useCallback((op: string, write: () => Promise<unknown>) => {
    if (loadFailedRef.current && !isCloudStorageMode) {
      console.error(`[library] ${op} not persisted: initial load failed; change kept in memory only`);
      return;
    }
    write().catch((err) => console.error(`[library] ${op} failed`, err));
  }, []);

  const toggleBookmark = useCallback(
    (id: string) => {
      setPhrases((prev) => {
        const current = prev.find((p) => p.id === id);
        if (!current) return prev;
        const toggled = { ...current, isBookmarked: !current.isBookmarked };
        persist("toggleBookmark", () => repositories.phrases.put(toggled));
        return prev.map((p) => (p.id === id ? toggled : p));
      });
    },
    [persist]
  );

  const addPhrase = useCallback(
    (phrase: Phrase) => {
      setPhrases((prev) => {
        if (prev.find((p) => p.id === phrase.id)) return prev;
        const withTimestamp = { ...phrase, createdAt: phrase.createdAt ?? new Date().toISOString() };
        persist("addPhrase", () => repositories.phrases.put(withTimestamp));
        return [...prev, withTimestamp];
      });
    },
    [persist]
  );

  const updatePhrase = useCallback(
    (phrase: Phrase) => {
      setPhrases((prev) => {
        if (!prev.some((p) => p.id === phrase.id)) return prev;
        persist("updatePhrase", () => repositories.phrases.put(phrase));
        return prev.map((p) => (p.id === phrase.id ? phrase : p));
      });
    },
    [persist]
  );

  const mergeSuggestedPhrases = useCallback(
    (suggestions: Phrase[]) => {
      setPhrases((prev) => {
        const seenIds = new Set(prev.map((p) => p.id));
        const added: Phrase[] = [];
        suggestions.forEach((s) => {
          if (seenIds.has(s.id)) return;
          seenIds.add(s.id);
          added.push({ ...s, isBookmarked: false });
        });
        if (added.length === 0) return prev;
        persist("mergeSuggestedPhrases", () => repositories.phrases.putMany(added));
        return [...prev, ...added];
      });
    },
    [persist]
  );

  const addTranslationPhrase = useCallback(
    (phrase: Phrase) => {
      setPhrases((prev) => {
        if (prev.find((p) => p.id === phrase.id)) return prev;
        const stored = { ...phrase, isBookmarked: false };
        persist("addTranslationPhrase", () => repositories.phrases.put(stored));
        return [...prev, stored];
      });
    },
    [persist]
  );

  const phraseTags = useMemo(() => tags.filter((t) => t.type === "phrase"), [tags]);
  const sessionTags = useMemo(() => tags.filter((t) => t.type === "session"), [tags]);

  const createTag = useCallback(
    (name: string, type: TagType): Tag => {
      const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase() && t.type === type);
      if (existing) return existing;
      const tag: Tag = { id: newId(), name, type, createdAt: new Date().toISOString() };
      setTags((prev) => [...prev, tag]);
      persist("createTag", () => repositories.tags.create(tag));
      return tag;
    },
    [tags, persist]
  );

  const deleteTag = useCallback(
    (id: string) => {
      setTags((prev) => prev.filter((t) => t.id !== id));
      persist("deleteTag", () => repositories.tags.delete(id));
      setPhrases((prev) => {
        const changed: Phrase[] = [];
        const updated = prev.map((p) => {
          if (!p.tags?.includes(id)) return p;
          const next = { ...p, tags: p.tags.filter((t) => t !== id) };
          changed.push(next);
          return next;
        });
        if (changed.length > 0) {
          persist("deleteTag (detach from phrases)", () => repositories.phrases.putMany(changed));
        }
        return updated;
      });
      setSessions((prev) =>
        prev.map((s) => {
          if (!s.tags?.includes(id)) return s;
          const updated = { ...s, tags: s.tags.filter((t) => t !== id) };
          persist("deleteTag (detach from session)", () => repositories.conversations.updateSession(updated));
          return updated;
        })
      );
    },
    [persist]
  );

  const setPhraseTags = useCallback(
    (phraseId: string, tagIds: string[]) => {
      setPhrases((prev) =>
        prev.map((p) => {
          if (p.id !== phraseId) return p;
          const updated = { ...p, tags: tagIds, isBookmarked: tagIds.length > 0 || p.isBookmarked };
          persist("setPhraseTags", () => repositories.phrases.put(updated));
          return updated;
        })
      );
    },
    [persist]
  );

  const setSessionTags = useCallback(
    (sessionId: string, tagIds: string[]) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const updated = { ...s, tags: tagIds };
          persist("setSessionTags", () => repositories.conversations.updateSession(updated));
          return updated;
        })
      );
    },
    [persist]
  );

  const addSessionRecord = useCallback(
    (session: Session) => {
      setSessions((prev) => [session, ...prev]);
      persist("addSessionRecord", () => repositories.conversations.addSession(session));
    },
    [persist]
  );

  const renameSession = useCallback(
    (id: string, title: string) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          const updated = { ...s, title };
          persist("renameSession", () => repositories.conversations.updateSession(updated));
          return updated;
        })
      );
      setConversationLessons((prev) =>
        prev.map((l) => {
          if (l.sessionId !== id) return l;
          const updated = { ...l, title };
          persist("renameSession (lesson title)", () => repositories.conversationLessons.update(updated));
          return updated;
        })
      );
    },
    [persist]
  );

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => prev.filter((s) => s.id !== id));
      persist("deleteSession", () => repositories.conversations.deleteSession(id));
    },
    [persist]
  );

  const deleteSessionMessage = useCallback(
    (sessionId: string, messageId: string) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const updated = { ...s, messages: s.messages.filter((m) => m.id !== messageId) };
          persist("deleteSessionMessage", () => repositories.conversations.updateSession(updated));
          return updated;
        })
      );
    },
    [persist]
  );

  const saveConversationLesson = useCallback(
    (lesson: ConversationLesson) => {
      setConversationLessons((prev) => [...prev, lesson]);
      persist("saveConversationLesson", () => repositories.conversationLessons.save(lesson));
    },
    [persist]
  );

  const updateConversationLesson = useCallback(
    (lesson: ConversationLesson) => {
      setConversationLessons((prev) => prev.map((l) => (l.id === lesson.id ? lesson : l)));
      persist("updateConversationLesson", () => repositories.conversationLessons.update(lesson));
    },
    [persist]
  );

  const deleteConversationLesson = useCallback(
    (id: string) => {
      setConversationLessons((prev) => prev.filter((l) => l.id !== id));
      persist("deleteConversationLesson", () => repositories.conversationLessons.delete(id));
    },
    [persist]
  );

  const updateLessonProgress = useCallback(
    (progress: LessonProgress) => {
      setLessonProgress((prev) => ({ ...prev, [progress.lessonId]: progress }));
      persist("updateLessonProgress", () => repositories.lessons.updateProgress(progress));
    },
    [persist]
  );

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
