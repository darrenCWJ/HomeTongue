import { db } from "../local/db";
import { newId } from "../../utils/id";
import { emitSyncEvent } from "../../lib/syncEvents";
import type { OutboxEntity, OutboxEntry, OutboxOp } from "./types";

// Durable queue for failed cloud writes (the "outbox" pattern).
//
// Cloud mode is otherwise online-only: a repository write that fails
// (offline, expired session, RLS error) used to be console.error'd and lost
// while the optimistic in-memory state moved on. The outbox makes those
// writes durable: they are persisted to the local `outbox` Dexie table and
// replayed FIFO once connectivity/auth returns. Replays are safe to repeat —
// every cloud write is an id-keyed upsert or delete (idempotent).
//
// FLUSH TRIGGERS (all funnel through triggerOutboxFlush):
//   1. App start in cloud mode — once the restored auth user is known
//      (setOutboxUser is called by createOutboxRepositories).
//   2. window "online" events.
//   3. Successful auth (sign-in / user switch) via setOutboxUser.
//   4. Hold mode clearing (setOutboxHold(false) — LibraryProvider clears it
//      after a successful initial load).
//
// PER-USER ISOLATION: entries are tagged with the auth user id at enqueue
// time, and a flush only replays entries whose userId matches the CURRENT
// user. Entries for other users are HELD, not dropped — user A's offline
// edits must survive user B signing in on the same device; they flush when
// A signs back in. Writes that fail while nobody is (or was) signed in have
// no owner and are discarded with a console.error: they could never be
// attributed safely.
//
// BACKOFF: a flush pass stops at the first entry that fails (preserving FIFO
// order) and schedules a retry pass with exponential backoff. Manual triggers
// (online/auth/hold-clear) reset the backoff. An entry that fails
// MAX_ATTEMPTS replays is dropped with a console.error + "entry-dropped"
// event (surfaced as an error toast by useSyncToasts).

const MAX_ATTEMPTS = 8;
const BASE_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

type ReplayFn = (entry: OutboxEntry) => Promise<void>;

let replayEntry: ReplayFn | null = null;
let currentUserId: string | null = null;
let holdMode = false;
let flushInFlight: Promise<void> | null = null;
let blockedPasses = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let lastCreatedAt = 0;

/** Registers the function that replays one entry against the cloud repos. */
export function registerOutboxReplay(replay: ReplayFn): void {
  replayEntry = replay;
}

/**
 * Tracks the signed-in auth user. Called on session restore and on every
 * auth change; a (re)appearing user triggers a flush of their held entries.
 */
export function setOutboxUser(userId: string | null): void {
  if (userId === currentUserId) return;
  currentUserId = userId;
  if (userId !== null) triggerOutboxFlush();
}

/**
 * Hold mode: while held, the decorator enqueues writes directly instead of
 * attempting the network. LibraryProvider sets this when the cloud initial
 * load fails (writing from an unhydrated state must not touch the cloud) and
 * clears it after a successful load — which also flushes what was held.
 */
export function setOutboxHold(held: boolean): void {
  const wasHeld = holdMode;
  holdMode = held;
  if (wasHeld && !held) triggerOutboxFlush();
}

export function isOutboxHeld(): boolean {
  return holdMode;
}

/**
 * Persist a failed (or held) write. Resolves even when the queue write itself
 * fails — the optimistic in-memory state has already moved on, and callers
 * (UI mutation paths) must never see a rejection from here.
 */
export async function enqueueWrite(entity: OutboxEntity, op: OutboxOp, payload: unknown): Promise<void> {
  if (currentUserId === null) {
    // No signed-in user to attribute the write to — flushing it later under
    // whoever signs in next would corrupt their data. Documented drop.
    console.error(`[outbox] ${entity}.${op} lost: no signed-in user to attribute the queued write to`);
    return;
  }
  // Strictly monotonic so FIFO order is unambiguous within a session even
  // when several writes land in the same millisecond.
  lastCreatedAt = Math.max(Date.now(), lastCreatedAt + 1);
  const entry: OutboxEntry = {
    id: newId(),
    userId: currentUserId,
    entity,
    op,
    payload,
    createdAt: lastCreatedAt,
    attempts: 0,
  };
  try {
    await db.outbox.add(entry);
    emitSyncEvent({ type: "write-queued", entity });
  } catch (err) {
    console.error(`[outbox] failed to queue ${entity}.${op} — change kept in memory only`, err);
  }
}

/** Reset backoff and run a flush pass now. Safe to call from any trigger. */
export function triggerOutboxFlush(): Promise<void> {
  blockedPasses = 0;
  return flushOutbox();
}

/**
 * Run one FIFO flush pass over the current user's entries. Concurrent calls
 * share the in-flight pass. A pass that gets blocked mid-queue schedules its
 * own backed-off retry.
 */
export function flushOutbox(): Promise<void> {
  if (flushInFlight) return flushInFlight;
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  flushInFlight = runFlushPass()
    .then((result) => {
      if (result === "blocked") {
        blockedPasses += 1;
        scheduleRetry();
      } else {
        blockedPasses = 0;
      }
    })
    .catch((err) => {
      console.error("[outbox] flush pass failed", err);
    })
    .finally(() => {
      flushInFlight = null;
    });
  return flushInFlight;
}

async function runFlushPass(): Promise<"idle" | "drained" | "blocked"> {
  if (!replayEntry || currentUserId === null || holdMode) return "idle";
  const all = await db.outbox.orderBy("createdAt").toArray();
  const mine = all.filter((entry) => entry.userId === currentUserId);
  if (mine.length === 0) return "idle";

  let flushed = 0;
  let outcome: "drained" | "blocked" = "drained";
  for (const entry of mine) {
    try {
      await replayEntry(entry);
      await db.outbox.delete(entry.id);
      flushed += 1;
    } catch (err) {
      const attempts = entry.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        // Exhausted: drop so a poison entry cannot block the queue forever.
        console.error(`[outbox] dropping ${entry.entity}.${entry.op} after ${attempts} failed attempts`, err);
        await db.outbox.delete(entry.id);
        emitSyncEvent({ type: "entry-dropped", entity: entry.entity, op: entry.op });
        continue;
      }
      await db.outbox.put({ ...entry, attempts });
      console.error(
        `[outbox] ${entry.entity}.${entry.op} replay failed (attempt ${attempts}/${MAX_ATTEMPTS}) — will retry`,
        err
      );
      // Stop the pass at the first retryable failure to preserve FIFO order;
      // the backed-off retry pass picks the queue up from here.
      outcome = "blocked";
      break;
    }
  }
  if (flushed > 0) emitSyncEvent({ type: "flush-complete", flushedCount: flushed });
  return outcome;
}

function scheduleRetry(): void {
  if (retryTimer !== null) return;
  const delay = Math.min(BASE_RETRY_DELAY_MS * 2 ** Math.max(blockedPasses - 1, 0), MAX_RETRY_DELAY_MS);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushOutbox();
  }, delay);
}

/** Test-only: reset all module state (never called from production code). */
export function _resetOutboxForTests(): void {
  replayEntry = null;
  currentUserId = null;
  holdMode = false;
  flushInFlight = null;
  blockedPasses = 0;
  lastCreatedAt = 0;
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}
