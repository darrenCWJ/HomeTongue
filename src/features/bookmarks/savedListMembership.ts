import type { Phrase } from "../../types";

/**
 * A phrase belongs in the Saved (Phrases tab) list when it is bookmarked OR
 * carries at least one tag — tags are a second, independent reason to keep a
 * phrase around. Un-bookmarking must therefore also clear tags (see
 * PhraseCard's and SessionViewer's un-bookmark handlers, BM-03), or a phrase
 * can linger here with a filled bookmark icon despite isBookmarked being
 * false.
 */
export function isSavedListMember(phrase: Phrase): boolean {
  return phrase.isBookmarked || (phrase.tags?.length ?? 0) > 0;
}
