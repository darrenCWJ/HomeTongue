import type { AnimationPlaybackControlsWithThen } from "motion/react";

// Shared by both flashcard decks (FlashcardExercise and ConvFlashcardExercise),
// which run the same swipe-to-advance choreography.

/** Duration of a card's exit tween, in seconds (motion's unit). */
export const CARD_EXIT_S = 0.18;

/**
 * Ceiling on how long a card exit may be awaited, comfortably clear of a
 * healthy tween so it never preempts one.
 *
 * motion resolves an animation's promise only on natural completion
 * (JSAnimation.finish → notifyFinished); stop() and cancel() tear the animation
 * down WITHOUT resolving it, and a drag landing inside the exit window stops
 * the tween on that motion value. Awaiting it bare would leave the caller's
 * in-flight guard latched forever — every control on the deck dead — so the
 * wait is bounded.
 */
const CARD_EXIT_TIMEOUT_MS = 400;

/**
 * Await a card's exit tween, never longer than the ceiling above.
 *
 * Typed as motion's own `AnimationPlaybackControlsWithThen` rather than
 * `PromiseLike<void>`: its `then` is
 * `(onResolve: VoidFunction, onReject?: VoidFunction) => Promise<void>`, whose
 * REQUIRED first parameter is not assignable to `PromiseLike`'s optional one,
 * so the standard type rejects it (and `Promise.race` rejects it for the same
 * reason). The `.then()` call below is what normalises it into a real promise.
 */
export function awaitCardExit(exit: AnimationPlaybackControlsWithThen): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ceiling = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, CARD_EXIT_TIMEOUT_MS);
  });
  // Cleared on whichever branch wins so a settled race leaves no pending timer
  // holding the callback (and the exercise) alive.
  return Promise.race([exit.then(() => {}), ceiling]).finally(() => clearTimeout(timer));
}
