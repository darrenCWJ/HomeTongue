import { useEffect } from "react";
import { toast } from "sonner";
import { subscribeSyncEvents } from "./syncEvents";

// How often at most the "saved locally, will sync later" toast may appear —
// a burst of queued writes (e.g. deleting a tag detaches many phrases) must
// not produce a toast per write.
const QUEUED_TOAST_THROTTLE_MS = 30_000;

// Fixed id so a repeat emit REPLACES the standing banner instead of stacking
// another copy of it (sonner dedupes by id).
const PERSISTENCE_DISABLED_TOAST_ID = "persistence-disabled";

/**
 * Surfaces persistence-health events (src/lib/syncEvents.ts) as sonner toasts.
 * Mounted once from LibraryProvider. In local storage mode the cloud-outbox
 * events never fire; only the degraded-storage banner can appear.
 */
export function useSyncToasts(): void {
  useEffect(() => {
    let lastQueuedToastAt = 0;
    return subscribeSyncEvents((event) => {
      switch (event.type) {
        case "write-queued": {
          const now = Date.now();
          if (now - lastQueuedToastAt >= QUEUED_TOAST_THROTTLE_MS) {
            lastQueuedToastAt = now;
            toast.info("Saved on this device — will sync when back online");
          }
          break;
        }
        case "flush-complete":
          // Only emitted when queued writes were actually pushed, so this is
          // exactly the "back in sync after having been behind" moment.
          toast.success("Synced");
          break;
        case "entry-dropped":
          toast.error("A change could not be synced and was discarded.");
          break;
        case "persistence-disabled":
          // Not a hiccup that resolves itself: storage is out for the rest of
          // the session, so the banner has to stay up rather than time out
          // and leave the user believing their work is being saved.
          toast.error("Storage isn't available — changes won't be saved on this device.", {
            id: PERSISTENCE_DISABLED_TOAST_ID,
            duration: Infinity,
          });
          break;
      }
    });
  }, []);
}
