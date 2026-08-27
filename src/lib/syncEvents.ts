// Tiny typed event channel carrying persistence health to the UI
// (src/lib/useSyncToasts.ts): the cloud-write outbox
// (src/repositories/outbox/) reports sync progress, and LibraryProvider
// reports a storage layer that has stopped persisting at all.
//
// Deliberately dependency-free: the UI can subscribe in every build without
// pulling any storage or Supabase code into the bundle. In local storage mode
// only "persistence-disabled" can ever be emitted — the outbox events are
// cloud-only.

export type SyncEvent =
  /** A cloud write failed (or was held) and was queued for later sync. */
  | { type: "write-queued"; entity: string }
  /** A flush pass completed and actually pushed queued writes to the cloud. */
  | { type: "flush-complete"; flushedCount: number }
  /** A queued write exhausted its retries and was discarded. */
  | { type: "entry-dropped"; entity: string; op: string }
  /**
   * Local mode only: the backing store could not be read, so writes are
   * skipped and changes live in memory until the tab closes. Unlike the
   * outbox events this is not transient — it holds for the whole session.
   */
  | { type: "persistence-disabled" };

type SyncEventListener = (event: SyncEvent) => void;

const listeners = new Set<SyncEventListener>();

/** Subscribe to sync events. Returns an unsubscribe function. */
export function subscribeSyncEvents(listener: SyncEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Emit an event to all subscribers. A throwing listener never breaks others. */
export function emitSyncEvent(event: SyncEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      console.error("[syncEvents] listener failed", err);
    }
  }
}
