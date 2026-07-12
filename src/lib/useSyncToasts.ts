import { useEffect } from "react";
import { toast } from "sonner";
import { subscribeSyncEvents } from "./syncEvents";

// How often at most the "saved locally, will sync later" toast may appear —
// a burst of queued writes (e.g. deleting a tag detaches many phrases) must
// not produce a toast per write.
const QUEUED_TOAST_THROTTLE_MS = 30_000;

/**
 * Surfaces cloud-sync outbox events (src/repositories/outbox/) as sonner
 * toasts. Mounted once from LibraryProvider. In local storage mode no sync
 * events are ever emitted, so the subscription is inert.
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
      }
    });
  }, []);
}
