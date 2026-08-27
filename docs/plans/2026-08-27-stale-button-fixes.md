# Stale-Button Fix Campaign — Implementation Plan

Spec: the click-path audit (46 findings, IDs CHAT/LEARN/BM/PROF-NN) + 2 cross-cutting persistence holes. Every task below lists the finding IDs it closes, the exact design, and required tests.

## Global Constraints

- Branch: `fix/stale-buttons-audit`. Never commit directly to main.
- Strict TS; `pnpm typecheck` must pass with 0 errors after every task.
- TDD: write the failing test first where the behavior is testable (vitest + jsdom + @testing-library/react are configured; component tests need `import "@testing-library/jest-dom/vitest"` at top of the test file for tsc). Test files live next to source. AAA structure, descriptive names.
- Run scoped verification per task: `pnpm typecheck && pnpm eslint <changed files> && pnpm vitest run <affected test files/dirs>`. Full suite runs at campaign end.
- Bundle-purity invariant (CLAUDE.md): any module importing `src/lib/supabase.ts` gates with a literal `!!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)`. Local-only builds must keep all supabase code dead-code-eliminated. Do not import cloud modules outside existing statically-gated branches.
- Immutability: never mutate provider state in place; functional updates for state derived from previous state.
- New callbacks in context providers use `useCallback` with exhaustive deps and are added to the value `useMemo` (both list sites).
- Files stay under 400 lines preferred / 800 hard cap; extract helpers rather than growing a file past the cap.
- Generate ids with `newId()` from `src/utils/id.ts`.
- Do NOT touch `tests/api-handlers.test.js`, `api/`, `vite.config.ts` (no server changes in this campaign).
- Keep comments to constraints the code can't show; match surrounding idiom; no console.log.
- Commit per task with a conventional message (`fix: …`) ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Task 1: Guest/local repository routing in cloud builds

Closes: cross-cutting "guest persistence black hole" (guest writes silently dropped; guests re-onboard every visit; cloud reads throw for guests).

Design — route per-call by auth state, matching the shipped promise "Guest data stays on this device":

1. `src/repositories/outbox/outboxStore.ts`: add `export function getOutboxUserId(): string | null { return currentUserId; }` (the module already tracks `currentUserId` via `setOutboxUser`, called on session restore and every auth change — verify that wiring in `createOutboxRepositories` and reuse it; do NOT add a second auth subscription).
2. New `src/repositories/routing.ts`: `export function createSessionRoutedRepositories(cloud: Repositories, local: Repositories, hasCloudUser: () => boolean): Repositories`. For each of the 7 repositories, return an object implementing the same interface where EVERY method delegates at call time: `(hasCloudUser() ? cloud : local).phrases.method(...)`. Hand-write per-interface routers (small, typed) or a typed generic helper — no `any` leaking into the public types. This module must import nothing supabase-related (it only receives already-constructed objects) so it is safe in all bundles.
3. `src/repositories/index.ts` cloud branch: build the local set AND the outbox-wrapped cloud set, and export `repositories = createSessionRoutedRepositories(outboxWrapped, localSet, () => getOutboxUserId() !== null)`. Local-mode branch unchanged. `isCloudStorageMode` semantics unchanged.
4. Timing note (document in a comment): at cloud-mode app start the router reads local until the session restore lands; AuthProvider then bumps `authEpoch` (null→user counts as a user change), so all providers re-load from cloud. Guests (no session) stay on local permanently; sign-out (user→null) bumps the epoch and providers re-load from local Dexie — the previous account's cloud data is no longer left in memory.
5. Verify `src/services/cloudImportService.ts` still reads LOCAL data explicitly (it must not go through the router for its local reads — if it uses the routed singleton for local reads, point it at the Local* implementations directly) and writes cloud only when signed in (it already requires a session).

Tests (new `src/repositories/routing.test.ts`): router delegates each repository group to cloud when hasCloudUser() true and to local when false, per-call (flip the flag between calls on the same object); a write made as guest lands in the local impl and never touches the cloud impl. Plus: `src/repositories/index` shape test if one exists — extend, don't duplicate.

Acceptance: in cloud builds, with no signed-in user, all reads/writes hit Dexie (no thrown "Sign in to sync your data" from provider loads for guests); signed-in behavior unchanged (outbox intact). Typecheck clean. Do not modify LibraryProvider/ProfileProvider in this task.

## Task 2: Profile hydration status — stop onboarding-clobber (PROF-01)

Closes: PROF-01 (CRITICAL), the null-resurrect path in `updatePersonaInBackground`, and the "onboarding flash for returning users".

Design:
1. `src/app/context/ProfileProvider.tsx`: add `profileStatus: "loading" | "loaded" | "error"` state (initial "loading"). The load effect sets "loaded" on resolve (even when the resolved profile is null — a genuinely new user), "error" on reject (keep the console.error). Reset to "loading" at the start of each run (epoch change / retry). Add `retryProfileLoad: () => void` — bumps a local `retryCount` state; effect deps become `[reloadEpoch, retryCount]`. Expose both through the context value (+useMemo deps).
2. Guard `updateUserProfile`: if `prev === null && profileStatus !== "loaded"`, do NOT create a fresh profile — log `console.warn("[profile] write ignored: profile not hydrated yet")` and return prev unchanged. (When status IS "loaded" and prev is null, creating a fresh profile is correct — that's a real new user.) Same guard inside `updatePersonaInBackground`'s completion (skip the effectiveProfile resurrect unless status is "loaded").
   Implementation note: the callbacks currently have empty dep arrays; read status via a ref kept in sync (`statusRef`) so deps stay stable — document why.
3. `src/app/components/Layout.tsx`: consume `profileStatus`. `needsOnboarding = accessCodePassed && emailGatePassed && profileStatus === "loaded" && !userProfile?.name`. While gates passed and `profileStatus === "loading"` → render a minimal centered spinner (match the app's existing Loader2/animate-spin idiom, `text-faint`), NOT OnboardingPage, NOT a bare null. When `profileStatus === "error"` → render a minimal centered block: "Couldn't load your data." + a Retry button calling `retryProfileLoad` (styles: existing button idiom, `bg-brand-blue` primary).
4. Do NOT change onboarding itself here.

Tests: ProfileProvider unit-ish tests via a harness component (mock `../../repositories` module): (a) slow load → updateUserProfile during "loading" does not create a profile and does not call saveProfile; (b) after load resolves null → updateUserProfile creates exactly one fresh profile; (c) load rejection → status "error", retryProfileLoad re-runs the load. Layout-level: component test that with gates passed and profile loading, OnboardingPage's heading is NOT rendered and the spinner is; with status loaded + no name, onboarding IS rendered (mock the pages/providers as in `src/features/profile/ProfilePage.test.tsx`).

Acceptance: a returning cloud user with a slow/failed profile load can never reach OnboardingPage, and no code path can upsert a fresh profile over a stored row while unhydrated.

## Task 3: Unify cloud sign-out + import toast (PROF-02, PROF-07)

Design:
1. `src/features/profile/components/CloudAccountSection.tsx`: replace `handleCloudSignOut` body with the shared flow: `await performFullSignOut({ hasCloudSession: true, signOutCloud: signOut })` (import from `../../../lib/fullSignOut`), keeping the `isSigningOut` guard and error toast; drop the manual `localStorage.removeItem` and success toast (the reload makes it moot — success toast would never be seen; remove it rather than leave dead code). The component receives `signOut` via props already.
2. PROF-07: in `handleImportToCloud`, when ALL counts are zero AND the local stores were empty, toast "This device has no local data to import." — distinguish from the already-present case. `importLocalDataToCloud` (src/services/cloudImportService.ts) must return enough to tell: add `sourceCounts` (total local rows per entity) to its return alongside imported counts — additive, non-breaking; adjust its tests.
3. Update `src/features/profile/components/*` tests if any cover these paths; add a component test for CloudAccountSection: sign-out click calls performFullSignOut (mock module) with hasCloudSession true; failure → error toast + button re-enabled.

Acceptance: account-card sign-out fully resets the app exactly like the bottom Sign Out (PROF-02's stale-state leak closed by the reload); empty-device import says so.

## Task 4: Conversation-lesson patch-merge writes (LEARN-01, LEARN-02)

Design:
1. `src/app/context/LibraryProvider.tsx`: change `updateConversationLesson` signature to `(id: string, patch: Partial<ConversationLesson>) => void`. Implementation: functional state update — find current lesson by id, merge `{ ...current, ...patch }`, persist the MERGED object via the existing repository update. If the id is missing, no-op (console.warn). Update the context type + value memo. This kills the stale-snapshot clobber class at the root.
2. Update ALL callers (grep `updateConversationLesson(`): `src/features/learn/conversation-lesson/ConversationLessonView.tsx` — `savePhase` passes `(lesson.id, { currentPhase: next })`; `handleBreakdownComplete` passes `(lesson.id, { vocabulary: updatedVocab, currentPhase: "flashcard" })`; `src/features/learn/LearnPage.tsx` `handleExamComplete` — compute exam fields from the CURRENT provider lesson, not the snapshot: look up `conversationLessons.find(l => l.id === activeConversationLesson.id)` for prior attempts/best score, pass a patch `{ examAttempts, examBestScore, examCompleted }`, and refresh `activeConversationLesson` from the patched current lesson; `src/features/bookmarks/hooks/useSessionLessonActions.ts` and any other caller — same pattern.
3. LEARN-01 root fully closed only if the ACTIVE lesson prop can't go stale for reads either: in `LearnPage`, derive the lesson passed to `ConversationLessonView`/exam from `conversationLessons` by id (`const activeLesson = conversationLessons.find(l => l.id === activeConversationLessonId) ?? snapshot`), keeping a plain `activeConversationLessonId` state instead of the object where feasible with minimal churn.
4. LEARN-02: `ConversationLessonView` line ~74 — `onComplete={() => savePhase("done")}`.

Tests: LibraryProvider-level test (mock repositories module): update with a patch merges over CURRENT state, not a stale object — simulate the audit's sequence (write vocabulary patch, then phase patch, assert vocabulary survives). Component-level: ConversationLessonView flashcard completion persists phase "done" (mock provider), Skip unchanged.

Acceptance: breakdown enrichment survives phase/exam writes; finishing flashcards persists like skipping; typecheck finds every caller.

## Task 5: Tour engine honesty (LEARN-03, PROF-05, LEARN-10, PROF-10)

Design (files: `src/app/components/tour/TourOverlay.tsx`, `TourProvider.tsx`, `useTourAutoTrigger.ts`, `src/features/profile/components/TourReplaySection.tsx`):
1. `TourProvider`: add `cancelTour()` — resets activeTour/currentStep WITHOUT writing tourCompleted. Keep completeTour as-is.
2. `TourOverlay`: store the retry `setTimeout` id in a ref; clear it in the effect cleanup keyed on `[activeTour, currentStep, isActive]` (closes LEARN-10 + PROF-10 stale-timer interference). Missing-anchor behavior: if the FIRST step's anchor (step index 0) never appears after the retry budget → `cancelTour()` (no profile write, no burn-through). For a later step's missing anchor, keep advancing (content may legitimately hide a step) BUT if advancing would COMPLETE the tour from a missing-anchor auto-advance AND no step was ever successfully positioned, cancel instead of completing. Track "any step rendered" in a ref reset on tour start.
3. `useTourAutoTrigger`: depend on `userProfile?.name` and `userProfile?.tourCompleted` (narrow fields), not the whole profile object — kills the re-arm on unrelated profile writes (LEARN-03's mid-lesson hijack). Keep the 600ms delay + cleanup.
4. `TourReplaySection`: replace the fixed 300ms navigate-then-start with a retry-friendly start: keep the navigate, but startTour may now safely fire early since a missing first anchor cancels harmlessly; bump the pre-start delay to 300ms + rely on TourOverlay's retry budget; ALSO make the replay button clear that page's `tourCompleted` flag ONLY via the existing explicit flow (verify what it does today — if it pre-clears the flag, keep; the important part is a slow chunk no longer writes tourCompleted without showing anything).

Tests: TourOverlay unit tests are DOM-heavy — cover the pure decisions: extract the "on anchor missing" decision into a small exported helper (e.g. `resolveMissingAnchor(stepIndex, anyStepRendered, isLastStep) => "cancel" | "advance"`) and unit-test it; component test: starting a tour whose first anchor is absent results in no `updateUserProfile` call (mock provider + fake timers).

Acceptance: a tour can no longer mark itself completed (or write anything) without at least one step actually rendering; timers never outlive their step; unrelated profile writes don't relaunch tours.

## Task 6: Chat reset epoch + language invalidation (CHAT-02, CHAT-03, CHAT-04, CHAT-09)

Design (files: `src/features/chat/ChatPage.tsx`, `hooks/useSuggestionFlow.ts`, `hooks/useReplyFlow.ts`, `hooks/useMicRecording.ts`, `hooks/useSessionSave.ts`):
1. Introduce a chat-epoch ref in ChatPage (`chatEpochRef`), passed to the hooks that run multi-second awaits. Bump it in ONE shared `resetConversationState()` helper in ChatPage that does exactly what `handleNewChat` does today (invalidateSuggestions, prefetchCacheRef.clear, lastRecordRef=null, clear latestSuggestions and pendingEnglish state). `handleNewChat` calls it; `confirmSave` (via a new optional `onAfterSave` callback param to useSessionSave, wired from ChatPage) calls it after saveSession (closes CHAT-02).
2. CHAT-04: in `useReplyFlow.handleReply` and `confirmEnglishReply`, capture `const epoch = chatEpochRef.current` before the await; after the await, if `chatEpochRef.current !== epoch` → discard (no addPhrase/addMessage/autoplay/setStage side effects beyond clearing the busy stage). Same guard in `useMicRecording.stopListening` around the post-transcription writes (`updateMessage`/`updatePhrase`/`addBotSuggestions`/`setPendingEnglish`).
3. CHAT-03: in ChatPage, an effect watching `activeLanguageCode` (from the reactive hook already used there) that — on change, not on mount — calls `resetConversationState()`. This clears chips/prefetch/append-window across dialect switches.
4. CHAT-09: `useSessionSave.confirmSave` re-checks `messages.length === 0` → toast "Nothing to save — the conversation is empty." + close dialog without saving. ALSO close the save dialog inside `resetConversationState` if open (belt and braces; New Chat while dialog open).

Tests: useSessionSave unit test for the empty re-check; reply-flow guard test (hook-level with mocked deps: bump epoch mid-await → no addMessage); a ChatPage-level test is heavy — cover the reset helper's contract via a focused hook/component test with mocked children if ChatPage renders too much (mock child components like the ProfilePage test does).

Acceptance: after Save or New Chat or a dialect switch, no state from the previous conversation (append window, chips, prefetched audio, in-flight replies) can surface; empty ghost sessions impossible.

## Task 7: Chat mechanics (CHAT-01, CHAT-05, CHAT-06, CHAT-08, CHAT-10)

Design:
1. CHAT-01 (`useMicRecording.ts` + ChatPage): add an effect watching `activeLanguageCode` (or the stt capability from the reactive pack): if a recording is active when it changes → `stopListening()` immediately (hard stop; the recording is attributed to the old pack — simplest correct behavior; do NOT let the recorder keep running). Keep the existing unmount cleanup.
2. CHAT-05 (`useReplyFlow.handleReply`): after cache-hit/prepare, if a phrase with that id already exists in `phrases`, call `updatePhrase(prepared.phrase)` instead of `addPhrase` (upsert semantics). Read existence from a live source (see next point).
3. CHAT-06 (`useMicRecording.ts`): ChatPage passes a `phrasesRef` (kept in sync like the existing `messagesRef`); the append branch reads `phrasesRef.current.find(...)` at WRITE time, and builds the update by MERGING the existing phrase (`{ ...existingPhrase, original, dialect, audioDataUrl, audioDataUrls }`) so `tags`/`createdAt`/`isBookmarked` set during transcription survive. CHAT-05's existence check uses the same ref.
4. CHAT-08 (`usePhraseSelection.ts` + `PhraseSaveSheet.tsx`): add `isSavingPhrase` state; set before the awaits, clear in finally; sheet's Save button `disabled={isSavingPhrase}` with the existing spinner idiom; early-return re-entry guard in the handler.
5. CHAT-10 (`useMicRecording.startListeningEnglish`): move `setLatestSuggestions([])` to AFTER `await startRecording()` succeeds.

Tests: mic append merge behavior (unit test the merge given an existing phrase with tags + bookmark — extract a pure `buildAppendedPhrase(existing, updates)` helper if the hook is untestable directly); double-save guard test for usePhraseSelection; CHAT-10 ordering test (mock recorder that rejects → suggestions untouched).

Acceptance: no hot-mic deadlock on dialect switch; chip taps upsert the prepared phrase; bookmarks/tags set during transcription survive appends; Save Phrase is single-fire; denied mic no longer eats chips.

## Task 8: Chat overlays + copy (CHAT-07, CHAT-11, CHAT-12, CHAT-13, CHAT-14)

Design:
1. CHAT-07 (ChatPage): guard `openSaveDialog` and long-press phrase-selection start on `pendingEnglish === null` (when a transcript review is open, ignore/close-first — choose ignore + subtle toast "Finish reviewing your transcript first."). Simplest exclusivity without z-index surgery.
2. CHAT-11 (`usePhraseSelection.handleSaveSelectedPhrase`): commit pending new-tag input at save time exactly like `useSessionSave.confirmSave` does (trim → createTag → append id), then clear the tag-input state after save.
3. CHAT-12 (`useSessionSave`): reset `isCreatingSessionTag`/`newSessionTagInput` in `openSaveDialog`; dedupe when appending the created tag id (`finalTags = [...new Set([...saveSessionTags, tag.id])]`).
4. CHAT-13 (`useSuggestionFlow.fetchSuggestions`): call `setLatestSuggestions([])` synchronously at fetch start (before the network call), so stale chips can't re-surface on failure; keep the existing gen guard.
5. CHAT-14 (`PendingEnglishOverlay.tsx`): replace hardcoded "Cantonese" (button + subtitle) with the active pack's display label (same reactive source ActionBar uses — check its prop/hook and mirror it; thread a prop if the component is presentational).

Tests: useSessionSave reset/dedupe tests; suggestion-clear-on-fetch-start test; PendingEnglishOverlay label test (render with a mocked pack label prop).

Acceptance: no invisible dialogs behind the transcript sheet; typed tags never silently dropped or mis-attached; failed refreshes can't resurrect stale chips; the confirm button names the actual language.

## Task 9: Bookmarks undo/tag family (BM-01, BM-04, BM-05, BM-07, BM-11)

Design (files: `src/features/bookmarks/hooks/useUndoableDeletions.ts`, `BookmarksPage.tsx`, `components/PhraseTagFilterBar.tsx`, `SessionTagFilterBar.tsx`, `PhraseCard.tsx`, `SessionCard.tsx`, `components/SessionViewer.tsx`):
1. BM-01: expose `cancelPendingTagDeletion(tagId): boolean` from useUndoableDeletions (clears timer + pending mark; returns whether one was pending). In both filter bars' create-commit paths: before `createTag`, check existing tags (case-insensitive, same type) — if the match is PENDING DELETION, cancel the pending deletion instead of creating (the tag visibly returns; show toast "Tag restored."). If it exists and is not pending, current behavior (select/return existing) stands.
2. BM-04: pass `pendingTagDeletions` into PhraseCard and SessionCard tag editors; filter their chip lists exactly like the filter bars do.
3. BM-05: SessionViewer derives its message list from live provider state: look up `sessions.find(s => s.id === viewingSession.id)` for messages (fall back to the snapshot only if the session vanished); the deletion timer then needs no `setViewingSession` patch — remove that patch and the mount-bound-setter hazard.
4. BM-07: `handleDeleteTag` records whether the tag was in each filter set; Undo re-adds it to the sets it was removed from.
5. BM-11: reset `isCreatingTag`/`newTagName`/`isEditingTags` in both tab-switch handlers (Phrases + Conversations buttons) — pairs with BM-08's change in Task 10 (same lines; coordinate: this task owns the draft-state resets, Task 10 owns the filter-clear condition; if this task lands first just reset drafts unconditionally in the handlers).
6. Preserve: pending-message hide behavior in the viewer (`pendingMsgDeletions` filter) must keep working against live-derived messages.

Tests: useUndoableDeletions tests with fake timers — cancelPendingTagDeletion cancels the commit; undo restores filter membership; create-during-window path (test the bar-level helper if extracted). SessionViewer live-derivation: deleting a message from the provider updates the open viewer (component test with mocked provider).

Acceptance: delete→recreate restores the tag; pending tags unassignable; deleted messages can't resurrect via remount; undo restores filters; drafts don't leak across tabs.

## Task 10: Bookmarks controls (BM-02, BM-03, BM-06, BM-08, BM-09, BM-10)

Design:
1. BM-02: gate TTS-fallback playback controls on capability: in `useBookmarkPlayback` accept/read `ttsEnabled` (from `useActiveCapabilities()` in BookmarksPage); in PhraseCard and SessionViewer, when a phrase/message has NO stored audio AND `!ttsEnabled` → hide the play control (render nothing, matching Learn's PlayButton gate). Stored-clip playback stays available regardless.
2. BM-03: SessionViewer's bookmark toggle-off path mirrors PhraseCard's un-bookmark: `updatePhrase({ ...phrase, isBookmarked: false, tags: [] })`.
3. BM-06: in `useBookmarkPhraseSelection`, when a message has no dialect text: bookmark click → `toast.error("Nothing to save from this message.")` instead of silent return; long-press guard may stay silent (no sheet) but the bookmark path must speak.
4. BM-08: Phrases tab button clears `selectedTagFilters` only when `activeTab !== "phrases"`.
5. BM-09: `commitTitle` with empty trimmed input → keep editor open + `toast.error("Name can't be empty.")` (do NOT silently close).
6. BM-10: PhraseCard speaker button gets `disabled:opacity-40` (mirror SessionViewer's affordance).

Tests: membership/unbookmark consistency test (after viewer un-bookmark, phrase absent from the saved list given no tags — test the pure filter at BookmarksPage level or extract `isSavedListMember(phrase)` helper + unit test); BM-09 commit behavior; BM-02 render-gate component test for PhraseCard (no audio + tts off → no play button; stored audio → button present).

Acceptance: play buttons never silently no-op; un-bookmark removes from Saved consistently; empty rename can't masquerade as success; active-tab click no longer clears filters.

## Task 11: Learn exercises + SRS dep (LEARN-04..09, LEARN-11, useReviewQueue epoch)

Design:
1. LEARN-04 (`MatchingExercise.tsx`): store the wrong-pair timeout id; clear it in `handleSelectEn`/`handleSelectZh` and on unmount; or gate the callback on the `wrong` pair identity — pick the timer-clear approach.
2. LEARN-05 (`RoleplayView.tsx` + `RoleplaySummary.tsx`): lift `savedTurnIds` state into RoleplayView (persists across summary open/close); derive phrase id deterministically as `roleplay-${turn.id}` so `addPhrase` dedupe holds; Save buttons reflect lifted state.
3. LEARN-06 (`PhraseBreakdownExercise.tsx`): per-index loading (e.g. cache value `"loading"` sentinel or a `loadingIndexes` set) — cached phrases render instantly with Next enabled.
4. LEARN-07 (both flashcard exercises): `isAnimatingRef` guard — early-return in `goToCard` while an advance is in flight (single-fire Finish included).
5. LEARN-08 (`ExamView.tsx`): `releasedDuringStartRef` — set in pointer-up when not yet recording; after `startRecording()` resolves in the start path, if set → immediately stop (treat as completed hold) instead of leaving the mic hot.
6. LEARN-09 (`ConversationExercise.tsx`): empty-turns state renders the FillBlank-style "Complete Level" button calling onComplete.
7. LEARN-11 (`ConversationLessonCard.tsx`): seed the edit draft from `lesson.title` when ENTERING edit mode, not at mount.
8. useReviewQueue (`src/features/learn/srs/useReviewQueue.ts`): re-run the load when the auth user changes — add `authEpoch` from `useAuth()` to the load effect deps (mirrors the providers' reloadEpoch pattern; keep mount behavior identical in local mode where epoch is constant 0).

Tests: matching-timer test with fake timers (new selection survives the 800ms window); roleplay saved-state test (lifted state survives summary unmount — component test); flashcard double-advance guard; useReviewQueue reload-on-epoch test (mock repositories + auth).

Acceptance: all listed interactions single-fire and honest; SRS queue follows auth switches.

## Task 12: Profile/gates misc + degraded-persistence visibility (PROF-03, PROF-04, PROF-06, PROF-08, PROF-09, cross-cutting local-mode banner)

Design:
1. PROF-03 (`OnboardingPage.tsx`): delete the setter-less `selectedJobTitle` state and the dead `if (selectedPersona === "work" && selectedJobTitle)` branch; instead, when work is selected, seed `personaProfiles: { work: { tone: "formal" } }` unconditionally in `handleFinish`. (No new job-title UI — the fix makes the Work choice do what the code intended; note in the commit body that a job-title picker remains open product work.)
2. PROF-04 (`ProfileHeader.tsx`): on blur with empty trimmed name → reset the input to the current profile name; never persist "".
3. PROF-06 (`VoiceSection.tsx`): selected-state compare via `asVoiceKey(userProfile?.preferredVoiceId)`.
4. PROF-08 (`AuthPage.tsx`): disable "Continue as Guest" while `isLoading` (visual disabled state consistent with the submit button).
5. PROF-09 (`OnboardingPage.tsx`): reset `voiceId` when `displayVoices` changes (effect or key the voice step on the pack code — choose the minimal one).
6. Local-mode degraded banner: `src/lib/syncEvents.ts` — add event type `"persistence-disabled"`; `LibraryProvider`'s failed-load path (local mode only — the branch that skips writes) emits it once per session; `src/lib/useSyncToasts.ts` maps it to a persistent (duration: Infinity, id-deduped) error toast: "Storage isn't available — changes won't be saved on this device." Keep cloud-mode behavior (outbox toasts) unchanged.
7. Note: PROF-01/02 are Tasks 2–3; do not re-touch here.

Tests: ProfileHeader empty-blur test; AuthPage guest-disabled-while-loading test; syncEvents/useSyncToasts persistence-disabled mapping test; VoiceSection legacy-id selected test with a legacy id fixture.

Acceptance: every profile-surface control does what it shows; a local-mode user whose storage failed KNOWS their changes aren't persisting.
