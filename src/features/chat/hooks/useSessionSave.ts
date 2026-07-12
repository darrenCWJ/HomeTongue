import { useState } from "react";
import { toast } from "sonner";
import type { Message, Tag, TagType } from "../../../types";

interface SessionSaveParams {
  messages: Message[];
  saveSession: (messages: Message[], title: string, tags?: string[]) => void;
  createTag: (name: string, type: TagType) => Tag;
}

/**
 * Save-session dialog state and flow: title, tag picks (including creating a
 * new session tag inline at confirm time), and the save action itself.
 */
export function useSessionSave({ messages, saveSession, createTag }: SessionSaveParams) {
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingSessionTag, setIsCreatingSessionTag] = useState(false);
  const [newSessionTagInput, setNewSessionTagInput] = useState("");
  const [saveSessionTags, setSaveSessionTags] = useState<string[]>([]);

  const openSaveDialog = () => {
    if (messages.length === 0) {
      toast.error("No conversation to save yet.");
      return;
    }
    setSaveTitle("");
    setSaveSessionTags([]);
    setIsSaveDialogOpen(true);
  };

  const confirmSave = async () => {
    const title = saveTitle.trim();
    if (!title) return;
    setIsSaving(true);
    let finalTags = saveSessionTags;
    if (isCreatingSessionTag && newSessionTagInput.trim()) {
      const tag = createTag(newSessionTagInput.trim(), "session");
      finalTags = [...saveSessionTags, tag.id];
      setIsCreatingSessionTag(false);
      setNewSessionTagInput("");
    }
    try {
      saveSession(messages, title, finalTags.length > 0 ? finalTags : undefined);
      setIsSaveDialogOpen(false);
      toast.success("Session saved!");
    } catch {
      toast.error("Failed to save session.");
      setIsSaveDialogOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  return {
    isSaveDialogOpen,
    setIsSaveDialogOpen,
    saveTitle,
    setSaveTitle,
    isSaving,
    isCreatingSessionTag,
    setIsCreatingSessionTag,
    newSessionTagInput,
    setNewSessionTagInput,
    saveSessionTags,
    setSaveSessionTags,
    openSaveDialog,
    confirmSave,
  };
}
