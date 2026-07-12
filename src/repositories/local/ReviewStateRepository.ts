import type { PhraseReviewState } from "../../types";
import type { IReviewStateRepository } from "../interfaces";
import { db } from "./db";

/**
 * Dexie-backed spaced-repetition schedule store (table `reviewStates`,
 * keyed by phraseId — see db.ts version 6).
 *
 * Lives in its own file (rather than LocalRepositories.ts) so SRS work does
 * not collide with concurrent changes to the other repositories.
 */
export class LocalReviewStateRepository implements IReviewStateRepository {
  async getAll(): Promise<PhraseReviewState[]> {
    return db.reviewStates.toArray();
  }

  async put(state: PhraseReviewState): Promise<void> {
    await db.reviewStates.put(state);
  }

  async delete(phraseId: string): Promise<void> {
    await db.reviewStates.delete(phraseId);
  }
}
