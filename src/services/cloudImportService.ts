import { db } from "../repositories/local/db";
import {
  CloudConversationLessonRepository,
  CloudConversationRepository,
  CloudLessonRepository,
  CloudPhraseRepository,
  CloudTagRepository,
  CloudUserRepository,
} from "../repositories/cloud/CloudRepositories";

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
  sessions: number;
  tags: number;
  conversationLessons: number;
  lessonProgress: number;
  profile: number;
}

/** Called after each entity group finishes: (completed, total, label). */
export type CloudImportProgress = (completed: number, total: number, label: string) => void;

type Importer = (onProgress?: CloudImportProgress) => Promise<CloudImportCounts>;

function createDisabledImporter(): Importer {
  return () => Promise.reject(new Error("Cloud import is not available in this build."));
}

function createCloudImporter(): Importer {
  const TOTAL_STEPS = 6;

  return async function importLocalDataToCloud(onProgress?: CloudImportProgress) {
    let completed = 0;
    const report = (label: string) => onProgress?.(++completed, TOTAL_STEPS, label);

    // Idempotent-ish: entities whose id already exists in the cloud are
    // skipped, so re-running the import never duplicates data.
    const phraseRepo = new CloudPhraseRepository();
    const cloudPhraseIds = new Set((await phraseRepo.getAll()).map((p) => p.id));
    const newPhrases = (await db.phrases.toArray()).filter((p) => !cloudPhraseIds.has(p.id));
    if (newPhrases.length > 0) {
      // putMany is upsert-only (never prunes), so only the genuinely new
      // phrases need to be written — existing cloud rows are untouched.
      await phraseRepo.putMany(newPhrases);
    }
    report("phrases");

    const sessionRepo = new CloudConversationRepository();
    const cloudSessionIds = new Set((await sessionRepo.getAll()).map((s) => s.id));
    const newSessions = (await db.sessions.toArray()).filter((s) => !cloudSessionIds.has(s.id));
    for (const session of newSessions) {
      await sessionRepo.addSession(session);
    }
    report("sessions");

    const tagRepo = new CloudTagRepository();
    const cloudTagIds = new Set((await tagRepo.getAll()).map((t) => t.id));
    const newTags = (await db.tags.toArray()).filter((t) => !cloudTagIds.has(t.id));
    for (const tag of newTags) {
      await tagRepo.create(tag);
    }
    report("tags");

    const lessonRepo = new CloudConversationLessonRepository();
    const cloudLessonIds = new Set((await lessonRepo.getAll()).map((l) => l.id));
    const newLessons = (await db.conversationLessons.toArray()).filter((l) => !cloudLessonIds.has(l.id));
    for (const lesson of newLessons) {
      await lessonRepo.save(lesson);
    }
    report("conversation lessons");

    const progressRepo = new CloudLessonRepository();
    const cloudProgress = await progressRepo.getAllProgress();
    const newProgress = (await db.lessonProgress.toArray()).filter((p) => !(p.lessonId in cloudProgress));
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
      sessions: newSessions.length,
      tags: newTags.length,
      conversationLessons: newLessons.length,
      lessonProgress: newProgress.length,
      profile: importedProfile,
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
 * One-way: local data is NOT deleted. Returns per-entity imported counts.
 * Requires cloud auth to be configured and the user to be signed in.
 */
export const importLocalDataToCloud: Importer = createImporter();
