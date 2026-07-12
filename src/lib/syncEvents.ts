// Tiny typed event channel between the cloud-write outbox
// (src/repositories/outbox/) and the UI (src/lib/useSyncToasts.ts).
//
// Deliberately dependency-free: the UI can subscribe in every build without
// pulling any storage or Supabase code into the bundle. In local storage mode
// nothing ever emits, so subscribers are inert.

export type SyncEvent =
  /** A cloud write failed (or was held) and was queued for later sync. */
  | { type: "write-queued"; entity: string }
  /** A flush pass completed and actually pushed queued writes to the cloud. */
  | { type: "flush-complete"; flushedCount: number }
  /** A queued write exhausted its retries and was discarded. */
  | { type: "entry-dropped"; entity: string; op: string };

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
