import type { SupabaseClient } from "@supabase/supabase-js";
import type { Phrase, Session, UserProfile, LessonProgress, ConversationLesson, Tag } from "../../types";
import type {
  IPhraseRepository,
  IConversationRepository,
  IUserRepository,
  ILessonRepository,
  IConversationLessonRepository,
  ITagRepository,
} from "../interfaces";
import { getSupabaseClient } from "../../lib/supabase";
import { sortSessionsNewestFirst, DEFAULT_TAGS } from "../local/LocalRepositories";
import {
  conversationLessonToRow,
  lessonProgressToRow,
  phraseToRow,
  profileToRow,
  rowToConversationLesson,
  rowToLessonProgress,
  rowToPhrase,
  rowToProfile,
  rowToSession,
  rowToTag,
  sessionToRow,
  tagToRow,
  type ConversationLessonRow,
  type LessonProgressRow,
  type PhraseRow,
  type ProfileRow,
  type SessionRow,
  type TagRow,
} from "./mapping";

// Supabase-backed implementations of the repository interfaces.
//
// Every method resolves the signed-in user and scopes reads/writes with
// user_id explicitly. RLS (see supabase/migrations/0001_initial_schema.sql)
// enforces the same boundary server-side regardless, so a bug here cannot
// leak another user's rows.

const SIGN_IN_REQUIRED = "Sign in to sync your data.";

interface AuthedContext {
  supabase: SupabaseClient;
  userId: string;
}

async function requireAuth(): Promise<AuthedContext> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (error || !userId) {
    throw new Error(SIGN_IN_REQUIRED);
  }
  return { supabase, userId };
}

function assertNoError(error: { message: string } | null, action: string): void {
  if (error) {
    throw new Error(`Cloud storage error (${action}): ${error.message}`);
  }
}

export class CloudPhraseRepository implements IPhraseRepository {
  async getAll(): Promise<Phrase[]> {
    const { supabase, userId } = await requireAuth();
    const { data, error } = await supabase.from("phrases").select("*").eq("user_id", userId);
    assertNoError(error, "load phrases");
    return ((data ?? []) as PhraseRow[]).map(rowToPhrase);
  }

  // saveAll mirrors the local repository's replace-all semantics (clear +
  // bulkPut) as: upsert every provided phrase, then delete the user's rows
  // that are no longer in the list. Tradeoff: simple and interface-compatible,
  // but not concurrency-safe across devices and re-writes unchanged rows.
  // Per-entity CRUD refinement is planned (docs/IMPROVEMENT_PLAN.md Phase 3).
  async saveAll(phrases: Phrase[]): Promise<void> {
    const { supabase, userId } = await requireAuth();
    const rows = phrases.map((phrase) => phraseToRow(phrase, userId));

    if (rows.length > 0) {
      const { error: upsertError } = await supabase.from("phrases").upsert(rows);
      assertNoError(upsertError, "save phrases");
    }

    let deleteQuery = supabase.from("phrases").delete().eq("user_id", userId);
    if (rows.length > 0) {
      const keptIds = rows.map((row) => row.id).join(",");
      deleteQuery = deleteQuery.not("id", "in", `(${keptIds})`);
    }
    const { error: deleteError } = await deleteQuery;
    assertNoError(deleteError, "prune phrases");
  }

  async toggleBookmark(id: string): Promise<Phrase[]> {
    const { supabase, userId } = await requireAuth();
    const { data, error } = await supabase
      .from("phrases")
      .select("is_bookmarked")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    assertNoError(error, "load phrase");

    const current = (data ?? null) as Pick<PhraseRow, "is_bookmarked"> | null;
    if (current) {
      const { error: updateError } = await supabase
        .from("phrases")
        .update({ is_bookmarked: !current.is_bookmarked })
        .eq("user_id", userId)
        .eq("id", id);
      assertNoError(updateError, "toggle bookmark");
    }
    return this.getAll();
  }
}

export class CloudConversationRepository implements IConversationRepository {
  async getAll(): Promise<Session[]> {
    const { supabase, userId } = await requireAuth();
    const { data, error } = await supabase.from("sessions").select("*").eq("user_id", userId);
    assertNoError(error, "load sessions");
    const sessions = ((data ?? []) as SessionRow[]).map(rowToSession);
    // Mirror the local repository: sort by ISO createdAt with a display-date
    // fallback for older records, newest first.
    return sortSessionsNewestFirst(sessions);
  }

  async addSession(session: Session): Promise<void> {
    const { supabase, userId } = await requireAuth();
    const { error } = await supabase.from("sessions").upsert(sessionToRow(session, userId));
    assertNoError(error, "add session");
  }

  async updateSession(session: Session): Promise<void> {
    const { supabase, userId } = await requireAuth();
    const { error } = await supabase.from("sessions").upsert(sessionToRow(session, userId));
    assertNoError(error, "update session");
  }

  async deleteSession(id: string): Promise<void> {
    const { supabase, userId } = await requireAuth();
    const { error } = await supabase.from("sessions").delete().eq("user_id", userId).eq("id", id);
    assertNoError(error, "delete session");
  }
}

export class CloudUserRepository implements IUserRepository {
  async getProfile(): Promise<UserProfile | null> {
    const { supabase, userId } = await requireAuth();
    const { data, error } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
    assertNoError(error, "load profile");
    const row = (data ?? null) as ProfileRow | null;
    return row ? rowToProfile(row) : null;
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    const { supabase, userId } = await requireAuth();
    const { error } = await supabase
      .from("profiles")
      .upsert(profileToRow(profile, userId), { onConflict: "user_id" });
    assertNoError(error, "save profile");
  }
}

export class CloudLessonRepository implements ILessonRepository {
  async getAllProgress(): Promise<Record<string, LessonProgress>> {
    const { supabase, userId } = await requireAuth();
    const { data, error } = await supabase.from("lesson_progress").select("*").eq("user_id", userId);
    assertNoError(error, "load lesson progress");
    const rows = (data ?? []) as LessonProgressRow[];
    return Object.fromEntries(rows.map((row) => [row.lesson_id, rowToLessonProgress(row)]));
  }

  async updateProgress(progress: LessonProgress): Promise<void> {
    const { supabase, userId } = await requireAuth();
    const { error } = await supabase
      .from("lesson_progress")
      .upsert(lessonProgressToRow(progress, userId), { onConflict: "user_id,lesson_id" });
    assertNoError(error, "save lesson progress");
  }
}

export class CloudConversationLessonRepository implements IConversationLessonRepository {
  async getAll(): Promise<ConversationLesson[]> {
    const { supabase, userId } = await requireAuth();
    const { data, error } = await supabase.from("conversation_lessons").select("*").eq("user_id", userId);
    assertNoError(error, "load conversation lessons");
    return ((data ?? []) as ConversationLessonRow[]).map(rowToConversationLesson);
  }

  async save(lesson: ConversationLesson): Promise<void> {
    const { supabase, userId } = await requireAuth();
    const { error } = await supabase
      .from("conversation_lessons")
      .upsert(conversationLessonToRow(lesson, userId));
    assertNoError(error, "save conversation lesson");
  }

  async update(lesson: ConversationLesson): Promise<void> {
    const { supabase, userId } = await requireAuth();
    const { error } = await supabase
      .from("conversation_lessons")
      .upsert(conversationLessonToRow(lesson, userId));
    assertNoError(error, "update conversation lesson");
  }

  async delete(id: string): Promise<void> {
    const { supabase, userId } = await requireAuth();
    const { error } = await supabase
      .from("conversation_lessons")
      .delete()
      .eq("user_id", userId)
      .eq("id", id);
    assertNoError(error, "delete conversation lesson");
  }
}

export class CloudTagRepository implements ITagRepository {
  async getAll(): Promise<Tag[]> {
    const { supabase, userId } = await requireAuth();
    const { data, error } = await supabase.from("tags").select("*").eq("user_id", userId);
    assertNoError(error, "load tags");
    const tags = ((data ?? []) as TagRow[]).map(rowToTag);
    if (tags.length === 0) {
      // Mirror the local repository: seed the default tag set on first use.
      const { error: seedError } = await supabase
        .from("tags")
        .upsert(DEFAULT_TAGS.map((tag) => tagToRow(tag, userId)));
      assertNoError(seedError, "seed default tags");
      return DEFAULT_TAGS;
    }
    return tags;
  }

  async create(tag: Tag): Promise<void> {
    const { supabase, userId } = await requireAuth();
    const { error } = await supabase.from("tags").upsert(tagToRow(tag, userId));
    assertNoError(error, "create tag");
  }

  async delete(id: string): Promise<void> {
    const { supabase, userId } = await requireAuth();
    const { error } = await supabase.from("tags").delete().eq("user_id", userId).eq("id", id);
    assertNoError(error, "delete tag");
  }
}
