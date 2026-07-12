import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { db } from "../../repositories/local/db";
import type { Phrase, Message, Session } from "../../types";
import { newId } from "../../utils/id";
import { isCloudStorageMode } from "../../repositories";
import { useAuth } from "./AuthProvider";
import { useProfile } from "./ProfileProvider";
import { useLibrary } from "./LibraryProvider";

interface ChatContextType {
  messages: Message[];
  addMessage: (msg: Message) => void;
  clearMessages: () => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  removeMessage: (id: string) => void;
  addBotSuggestions: (transcript: string, suggestions: Phrase[], messageId?: string) => void;
  addTranslation: (originalText: string, phrase: Phrase) => void;
  saveSession: (messages: Message[], title: string, tags?: string[]) => void;
  discardChat: (messages: Message[]) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const { authEpoch } = useAuth();
  const { activePersona, updatePersonaInBackground } = useProfile();
  const { addSessionRecord, mergeSuggestedPhrases, addTranslationPhrase } = useLibrary();
  const [messages, setMessages] = useState<Message[]>([]);

  // In cloud storage mode the initial load must re-run when the auth session
  // changes; in local mode this stays a constant 0 so the effect runs exactly
  // once, as before.
  const reloadEpoch = isCloudStorageMode ? authEpoch : 0;

  useEffect(() => {
    void reloadEpoch;
    db.draftMessages
      .get("draft")
      .then((draft) => {
        if (draft && draft.messages.length > 0) setMessages(draft.messages);
      })
      .catch((err) => {
        console.error("Failed to load saved data from local storage:", err);
      });
  }, [reloadEpoch]);

  useEffect(() => {
    if (messages.length === 0) {
      db.draftMessages.delete("draft").catch(() => {});
    } else {
      db.draftMessages.put({ key: "draft", messages }).catch(() => {});
    }
  }, [messages]);

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const clearMessages = useCallback(() => setMessages([]), []);

  const updateMessage = useCallback((id: string, updates: Partial<Message>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));
  }, []);

  const removeMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const addBotSuggestions = useCallback(
    (transcript: string, suggestions: Phrase[], messageId?: string) => {
      mergeSuggestedPhrases(suggestions);

      const msg: Message = {
        id: messageId ?? newId(),
        sender: "bot",
        text: transcript ? `Translating: "${transcript}"` : "Here are some ways to say that:",
        suggestions,
      };
      addMessage(msg);
    },
    [mergeSuggestedPhrases, addMessage]
  );

  const addTranslation = useCallback(
    (originalText: string, phrase: Phrase) => {
      addTranslationPhrase(phrase);
      const msg: Message = {
        id: newId(),
        sender: "bot",
        text: phrase.dialect,
        dialectText: phrase.dialect,
        pronunciation: phrase.pronunciation,
        context: phrase.context,
        phraseId: phrase.id,
      };
      setMessages((prev) => [...prev, msg]);
    },
    [addTranslationPhrase]
  );

  const saveSession = useCallback(
    (msgs: Message[], title: string, sessionTags?: string[]) => {
      const newSession: Session = {
        id: newId(),
        title,
        date: new Date().toLocaleDateString(),
        createdAt: new Date().toISOString(),
        messages: msgs,
        persona: activePersona,
        tags: sessionTags,
      };
      addSessionRecord(newSession);
      updatePersonaInBackground(msgs);
      setMessages([]);
    },
    [activePersona, addSessionRecord, updatePersonaInBackground]
  );

  const discardChat = useCallback(
    (msgs: Message[]) => {
      updatePersonaInBackground(msgs);
      setMessages([]);
    },
    [updatePersonaInBackground]
  );

  const value = useMemo(
    () => ({
      messages,
      addMessage,
      clearMessages,
      updateMessage,
      removeMessage,
      addBotSuggestions,
      addTranslation,
      saveSession,
      discardChat,
    }),
    [
      messages,
      addMessage,
      clearMessages,
      updateMessage,
      removeMessage,
      addBotSuggestions,
      addTranslation,
      saveSession,
      discardChat,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
};
