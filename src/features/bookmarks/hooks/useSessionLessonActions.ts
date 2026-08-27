import { useState, useRef } from "react";
import { toast } from "sonner";
import type { ConversationLesson, Session } from "../../../types";
import { extractVocabFromMessages } from "../../../utils/vocab";
import { DEFAULT_LANGUAGE_CODE } from "../../../languages/scope";

interface SessionLessonActionsParams {
  renameSession: (id: string, title: string) => void;
  conversationLessons: ConversationLesson[];
  saveConversationLesson: (lesson: ConversationLesson) => void;
}

/**
 * Session title editing (inline rename with focus handoff) and
 * conversation-to-lesson conversion, including the audio-source choice
 * dialog for personal-persona sessions.
 */
export function useSessionLessonActions({
  renameSession,
  conversationLessons,
  saveConversationLesson,
}: SessionLessonActionsParams) {
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [pendingConvertSession, setPendingConvertSession] = useState<Session | null>(null);
  const [audioSourceType, setAudioSourceType] = useState<"recorded" | "transcribed">("recorded");
  const titleInputRef = useRef<HTMLInputElement>(null);

  const startEditing = (id: string, currentTitle: string) => {
    setEditingSessionId(id);
    setEditingTitle(currentTitle);
    setTimeout(() => titleInputRef.current?.focus(), 50);
  };

  const commitTitle = (id: string) => {
    const trimmed = editingTitle.trim();
    if (!trimmed) {
      // Keep the editor open — closing here would read as a successful save
      // when nothing was renamed (BM-09).
      toast.error("Name can't be empty.");
      return;
    }
    renameSession(id, trimmed);
    setEditingSessionId(null);
  };

  const handleMakeLesson = (session: Session) => {
    const alreadyExists = conversationLessons.some((l) => l.sessionId === session.id);
    if (alreadyExists) {
      toast.info("This conversation is already a lesson.");
      return;
    }
    if ((session.persona ?? "personal") === "personal") {
      setAudioSourceType("recorded");
      setPendingConvertSession(session);
    } else {
      convertToLesson(session, "transcribed");
    }
  };

  const convertToLesson = (session: Session, audioSource: "recorded" | "transcribed") => {
    const vocab = extractVocabFromMessages(session.messages, audioSource);
    if (vocab.length === 0) {
      toast.error("No vocabulary found in this conversation.");
      return;
    }
    saveConversationLesson({
      id: session.id,
      sessionId: session.id,
      title: session.title ?? "Conversation",
      createdAt: new Date().toISOString(),
      vocabulary: vocab,
      examCompleted: false,
      examAttempts: 0,
      // A lesson derives from its source session, so it inherits the
      // session's language rather than whatever pack is active right now.
      languageCode: session.languageCode ?? DEFAULT_LANGUAGE_CODE,
    });
    setPendingConvertSession(null);
    toast.success("Added to Learn!");
  };

  return {
    editingSessionId,
    setEditingSessionId,
    editingTitle,
    setEditingTitle,
    titleInputRef,
    startEditing,
    commitTitle,
    pendingConvertSession,
    setPendingConvertSession,
    audioSourceType,
    setAudioSourceType,
    handleMakeLesson,
    convertToLesson,
  };
}
