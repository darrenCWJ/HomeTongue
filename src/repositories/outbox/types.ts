// Types for the cloud-write outbox (see outboxStore.ts for the mechanism).
// Kept in a standalone module so both the Dexie schema (local/db.ts) and the
// outbox runtime can import them without a cycle.

/** Which domain store a queued write belongs to. */
export type OutboxEntity =
  "phrase" | "tag" | "session" | "conversationLesson" | "progress" | "reviewState" | "profile";

/** The write shape. All cloud writes are id-keyed upserts or deletes, so
 * replaying an entry is idempotent — a duplicate flush cannot corrupt data. */
export type OutboxOp = "put" | "putMany" | "delete";

export interface OutboxEntry {
  /** newId() — primary key. */
  id: string;
  /**
   * The Supabase auth user the write belongs to. Entries are flushed ONLY
   * while this user is signed in; entries for other users are held (never
   * flushed, never dropped) until their owner signs back in. See
   * outboxStore.ts for the rationale.
   */
  userId: string;
  entity: OutboxEntity;
  op: OutboxOp;
  /**
   * The write's argument: the entity object for "put", an array for
   * "putMany", the string id for "delete". Stored structurally (Dexie
   * structured-clones it); narrowed back with casts at replay time in
   * OutboxRepositories.ts.
   */
  payload: unknown;
  /**
   * Enqueue time (ms epoch), strictly monotonic within a session so FIFO
   * replay order is well-defined even for writes in the same millisecond.
   */
  createdAt: number;
  /** Failed replay count. The entry is dropped once this reaches the max. */
  attempts: number;
}
