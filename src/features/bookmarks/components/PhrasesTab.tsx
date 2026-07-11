import { Bookmark, Volume2 } from "lucide-react";
import type { Phrase, Tag } from "../../../types";
import { PhraseCard } from "./PhraseCard";

interface PhrasesTabProps {
  bookmarkedPhrases: Phrase[];
  isTourMode: boolean;
  phraseTags: Tag[];
  editingTagsPhraseId: string | null;
  setEditingTagsPhraseId: (id: string | null) => void;
  playingId: string | null;
  onSpeak: (phraseId: string, text: string, audioDataUrl?: string, audioDataUrls?: string[]) => void;
  updatePhrase: (phrase: Phrase) => void;
  setPhraseTags: (phraseId: string, tagIds: string[]) => void;
}

export function PhrasesTab({
  bookmarkedPhrases,
  isTourMode,
  phraseTags,
  editingTagsPhraseId,
  setEditingTagsPhraseId,
  playingId,
  onSpeak,
  updatePhrase,
  setPhraseTags,
}: PhrasesTabProps) {
  return bookmarkedPhrases.length === 0 && !isTourMode ? (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mb-4">
        <Bookmark size={24} className="text-zinc-400" />
      </div>
      <h3 className="text-lg font-medium text-zinc-800 mb-1">No saved phrases yet</h3>
      <p className="text-sm text-zinc-500">
        Bookmark phrases in the chat to build your personal dialect phrasebook.
      </p>
    </div>
  ) : bookmarkedPhrases.length === 0 && isTourMode ? (
    <div
      data-tour="bookmarks-phrase-card"
      className="bg-white rounded-2xl p-4 shadow-sm border border-zinc-100 relative"
    >
      <div className="absolute top-4 right-4 flex items-center gap-1">
        <button className="text-brand-blue hover:text-brand-blue">
          <Bookmark size={20} className="fill-brand-blue" />
        </button>
      </div>
      <div className="pr-16">
        <p className="text-lg font-medium text-zinc-800 mb-1">你好，好高興認識你！</p>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-sm text-zinc-500 italic">nei5 hou2, hou2 gou1 hing3 jing6 sik1 nei5</p>
          <button className="p-1.5 rounded-full bg-zinc-50 text-zinc-400 hover:bg-zinc-100">
            <Volume2 size={14} />
          </button>
        </div>
        <p className="text-sm text-zinc-600">Hello, nice to meet you!</p>
      </div>
    </div>
  ) : (
    <>
      {bookmarkedPhrases.map((phrase, phraseIdx) => (
        <PhraseCard
          key={phrase.id}
          phrase={phrase}
          isFirst={phraseIdx === 0}
          phraseTags={phraseTags}
          editingTagsPhraseId={editingTagsPhraseId}
          setEditingTagsPhraseId={setEditingTagsPhraseId}
          playingId={playingId}
          onSpeak={onSpeak}
          updatePhrase={updatePhrase}
          setPhraseTags={setPhraseTags}
        />
      ))}
    </>
  );
}
