import { db } from "../repositories/local/db";
import {
  CloudConversationLessonRepository,
  CloudConversationRepository,
  CloudLessonRepository,
  CloudPhraseRepository,
  CloudTagRepository,
  CloudUserRepository,
} from "../repositories/cloud/CloudRepositories";
import { CloudReviewStateRepository } from "../repositories/cloud/CloudReviewStateRepository";

// One-way local → cloud import (Phase 3c): copies this device's IndexedDB
// data into the signed-in user's Supabase account through the cloud
// repositories. Local data is never modified or deleted.
//
// Config-gated with the same static-gate pattern as src/lib/authGateway.ts:
// when the VITE_SUPABASE_* env vars are absent the cloud branch — and with it
// the Supabase-backed repositories — is dead-code-eliminated from the bundle.
// Keep the expression in sync with src/lib/supabase.ts.
const isCloudImportConfigured: boolean = !!(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
);

export interface CloudImportCounts {
  phrases: number;
  reviewStates: number;
  sessions: number;
  tags: number;
  conversationLessons: number;
  lessonProgress: number;
  profile: number;
}

/**
 * Imported counts plus sourceCounts: the total local row count per entity,
 * independent of how many were already in the cloud. The caller needs this
 * to distinguish "this device has no local data" from "this device's data
 * is already synced" — both otherwise look identical (every imported count
 * is 0). Additive over CloudImportCounts so existing imported-count fields
 * are unchanged.
 */
export interface CloudImportResult extends CloudImportCounts {
  sourceCounts: CloudImportCounts;
}

/** Called after each entity group finishes: (completed, total, label). */
export type CloudImportProgress = (completed: number, total: number, label: string) => void;

type Importer = (onProgress?: CloudImportProgress) => Promise<CloudImportResult>;

function createDisabledImporter(): Importer {
  return () => Promise.reject(new Error("Cloud import is not available in this build."));
}

function createCloudImporter(): Importer {
  const TOTAL_STEPS = 7;

  return async function importLocalDataToCloud(onProgress?: CloudImportProgress) {
    let completed = 0;
    const report = (label: string) => onProgress?.(++completed, TOTAL_STEPS, label);

    // Idempotent-ish: entities whose id already exists in the cloud are
    // skipped, so re-running the import never duplicates data.
    const phraseRepo = new CloudPhraseRepository();
    const cloudPhraseIds = new Set((await phraseRepo.getAll()).map((p) => p.id));
    const localPhrases = await db.phrases.toArray();
    const newPhrases = localPhrases.filter((p) => !cloudPhraseIds.has(p.id));
    if (newPhrases.length > 0) {
      // putMany is upsert-only (never prunes), so only the genuinely new
      // phrases need to be written — existing cloud rows are untouched.
      await phraseRepo.putMany(newPhrases);
    }
    report("phrases");

    // Spaced-repetition schedules ride along with their phrases. A schedule
    // whose phrase was never saved to the cloud is harmless by design
    // (orphaned rows are allowed — see migration 0003), so no phrase-id
    // filtering is needed beyond the same idempotency check as above.
    const reviewStateRepo = new CloudReviewStateRepository();
    const cloudReviewPhraseIds = new Set((await reviewStateRepo.getAll()).map((s) => s.phraseId));
    const localReviewStates = await db.reviewStates.toArray();
    const newReviewStates = localReviewStates.filter((s) => !cloudReviewPhraseIds.has(s.phraseId));
    if (newReviewStates.length > 0) {
      await reviewStateRepo.putMany(newReviewStates);
    }
    report("review schedules");

    const sessionRepo = new CloudConversationRepository();
    const cloudSessionIds = new Set((await sessionRepo.getAll()).map((s) => s.id));
    const localSessions = await db.sessions.toArray();
    const newSessions = localSessions.filter((s) => !cloudSessionIds.has(s.id));
    for (const session of newSessions) {
      await sessionRepo.addSession(session);
    }
    report("sessions");

    const tagRepo = new CloudTagRepository();
    const cloudTagIds = new Set((await tagRepo.getAll()).map((t) => t.id));
    const localTags = await db.tags.toArray();
    const newTags = localTags.filter((t) => !cloudTagIds.has(t.id));
    for (const tag of newTags) {
      await tagRepo.create(tag);
    }
    report("tags");

    const lessonRepo = new CloudConversationLessonRepository();
    const cloudLessonIds = new Set((await lessonRepo.getAll()).map((l) => l.id));
    const localLessons = await db.conversationLessons.toArray();
    const newLessons = localLessons.filter((l) => !cloudLessonIds.has(l.id));
    for (const lesson of newLessons) {
      await lessonRepo.save(lesson);
    }
    report("conversation lessons");

    const progressRepo = new CloudLessonRepository();
    const cloudProgress = await progressRepo.getAllProgress();
    const localProgress = await db.lessonProgress.toArray();
    const newProgress = localProgress.filter((p) => !(p.lessonId in cloudProgress));
    for (const progress of newProgress) {
      await progressRepo.updateProgress(progress);
    }
    report("lesson progress");

    // The profile is only imported when the account has none yet — an
    // existing cloud profile is never overwritten by device data.
    const userRepo = new CloudUserRepository();
    const localProfile = (await db.profile.get("singleton"))?.value ?? null;
    let importedProfile = 0;
    if (localProfile && (await userRepo.getProfile()) === null) {
      await userRepo.saveProfile(localProfile);
      importedProfile = 1;
    }
    report("profile");

    return {
      phrases: newPhrases.length,
      reviewStates: newReviewStates.length,
      sessions: newSessions.length,
      tags: newTags.length,
      conversationLessons: newLessons.length,
      lessonProgress: newProgress.length,
      profile: importedProfile,
      sourceCounts: {
        phrases: localPhrases.length,
        reviewStates: localReviewStates.length,
        sessions: localSessions.length,
        tags: localTags.length,
        conversationLessons: localLessons.length,
        lessonProgress: localProgress.length,
        profile: localProfile ? 1 : 0,
      },
    };
  };
}

function createImporter(): Importer {
  if (isCloudImportConfigured) {
    return createCloudImporter();
  }
  return createDisabledImporter();
}

/**
 * Import all local (IndexedDB) data into the signed-in user's cloud account.
 * One-way: local data is NOT deleted. Returns per-entity imported counts
 * plus sourceCounts (total local rows per entity, imported or not).
 * Requires cloud auth to be configured and the user to be signed in.
 */
export const importLocalDataToCloud: Importer = createImporter();
