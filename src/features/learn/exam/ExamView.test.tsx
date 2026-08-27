import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { ConversationLesson } from "../../../types";
import { ExamView } from "./ExamView";

// LEARN-08 — a release that landed while getUserMedia was still pending hit
// `if (!isRecording) return` and was thrown away. The prompt then resolved
// into a recording nobody was holding: the mic stayed hot, and the user's
// next tap restarted it, discarding whatever it had captured.

const mockStartRecording = vi.fn(() => Promise.resolve());
const mockStopRecording = vi.fn(() => Promise.resolve(new Blob(["x"])));
const mockTranscribeDialect = vi.fn();
const mockScore = vi.fn(() => Promise.resolve({ score: 88, method: "llm" }));

vi.mock("../../../hooks/audio", () => ({
  useAudioRecorder: () => ({
    startRecording: () => mockStartRecording(),
    stopRecording: () => mockStopRecording(),
  }),
}));

vi.mock("../../../services/translationService", () => ({
  transcribeDialect: (...args: unknown[]) => mockTranscribeDialect(...args),
  transcribeAnyLanguage: vi.fn(() => Promise.resolve("")),
  scoreDialectAccuracyDetailed: () => mockScore(),
}));

vi.mock("../../../services/speechSampleService", () => ({
  recordSpeechSample: vi.fn(),
  consentFromProfile: () => ({}),
}));

vi.mock("../../../app/context/ProfileProvider", () => ({
  useProfile: () => ({ userProfile: null }),
}));

vi.mock("../../../hooks/useActiveLanguageCode", () => ({
  useActiveCapabilities: () => ({ tts: true, stt: true }),
  useActiveLanguagePack: () => ({ label: "Cantonese" }),
}));

vi.mock("../shared", () => ({
  PlayButtonDark: () => null,
}));

vi.mock("./TranscriptDiff", () => ({
  TranscriptDiff: ({ transcribed }: { transcribed: string }) => <span>{transcribed}</span>,
}));

// Nothing here depends on animation, and the real barrel costs this file ~5s of
// import — the whole per-test budget, which risks a timeout under a loaded
// full-suite run. ExamView only ever renders motion.div.
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, className }: { children?: ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const LESSON: ConversationLesson = {
  id: "lesson-1",
  sessionId: "session-1",
  title: "Ordering kopi",
  createdAt: "2026-01-01T00:00:00.000Z",
  vocabulary: [{ english: "one kopi", dialect: "一杯咖啡", romanization: "jat1 bui1 gaa3 fe1" }],
  examCompleted: false,
  examAttempts: 0,
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const mic = () => screen.getByRole("button", { name: /record your answer|stop recording/i });

let now = 1_000_000;

function renderExam() {
  const onComplete = vi.fn();
  render(<ExamView lesson={LESSON} onBack={vi.fn()} onComplete={onComplete} />);
  return { onComplete };
}

beforeEach(() => {
  now = 1_000_000;
  vi.clearAllMocks();
  mockStartRecording.mockResolvedValue(undefined);
  mockStopRecording.mockResolvedValue(new Blob(["x"]));
  mockTranscribeDialect.mockResolvedValue("一杯咖啡");
  mockScore.mockResolvedValue({ score: 88, method: "llm" });
  vi.spyOn(Date, "now").mockImplementation(() => now);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ExamView mic hold", () => {
  test("a release during a slow permission prompt completes the hold instead of leaving the mic hot", async () => {
    const permission = deferred<void>();
    mockStartRecording.mockReturnValueOnce(permission.promise);
    renderExam();

    fireEvent.pointerDown(mic());
    // The user lets go while the browser prompt is still up.
    fireEvent.pointerUp(mic());

    await act(async () => {
      permission.resolve();
      await flush();
    });

    expect(mockStopRecording).toHaveBeenCalled();
    expect(screen.getByText("Tap or hold to record")).toBeInTheDocument();
  });

  test("a normal hold records, scores, and shows the result", async () => {
    renderExam();

    await act(async () => {
      fireEvent.pointerDown(mic());
      await flush();
    });
    expect(screen.getByText("Recording… tap to stop")).toBeInTheDocument();

    now += 1500;
    await act(async () => {
      fireEvent.pointerUp(mic());
      await flush();
    });

    expect(screen.getByText("88%")).toBeInTheDocument();
  });

  // Reviewer finding: the release flag is a single slot, so an impatient
  // second press during the same prompt used to reset it — start #1 then
  // consumed what was really start #2's release, and start #2 armed a second
  // recorder with nobody holding the button and no way to stop it (a tap
  // restarts rather than stops, because the trigger ref reads as a hold).
  test("a second press during a slow permission prompt does not arm an unheld mic", async () => {
    const permission = deferred<void>();
    mockStartRecording.mockReturnValueOnce(permission.promise);
    renderExam();

    fireEvent.pointerDown(mic());
    fireEvent.pointerUp(mic());
    // The prompt is still up and the user taps again.
    fireEvent.pointerDown(mic());
    fireEvent.pointerUp(mic());

    await act(async () => {
      permission.resolve();
      await flush();
    });

    expect(mockStartRecording).toHaveBeenCalledTimes(1);
    expect(mockStopRecording).toHaveBeenCalled();
    expect(screen.getByText("Tap or hold to record")).toBeInTheDocument();
  });

  // The released-during-start flag is set from pointer-up, and pointer-leave
  // deliberately does not set it (it also fires for a mouse merely passing
  // over the button). This pins that the leave path still ends a real hold.
  test("dragging off the mic during a hold still ends the recording", async () => {
    renderExam();

    await act(async () => {
      fireEvent.pointerDown(mic());
      await flush();
    });
    now += 1500;
    await act(async () => {
      fireEvent.pointerLeave(mic());
      await flush();
    });

    expect(screen.getByText("88%")).toBeInTheDocument();
  });

  test("a tap arms the mic and a second tap stops it", async () => {
    renderExam();

    await act(async () => {
      fireEvent.pointerDown(mic());
      await flush();
    });
    // Released inside the hold threshold — this is a tap, so recording continues.
    now += 100;
    await act(async () => {
      fireEvent.pointerUp(mic());
      await flush();
    });
    expect(screen.getByText("Recording… tap to stop")).toBeInTheDocument();

    now += 1500;
    await act(async () => {
      fireEvent.pointerDown(mic());
      await flush();
    });

    expect(screen.getByText("88%")).toBeInTheDocument();
  });

  // ─── The pending-start slide-off hole ───────────────────────────────────────
  // While getUserMedia's prompt is up isRecording is still false, so
  // pointer-leave is deliberately ignored (a finger can drift off and back, and
  // a passing mouse fires it too). But a finger that slid off and lifted
  // elsewhere fired its pointerup somewhere else entirely: the release flag
  // stayed unset and the prompt resolved into a recording nobody was holding.
  // The button now captures the pointer on press, which makes the browser
  // retarget that outside release to the button — fired directly on it below,
  // since jsdom implements no capture. (Verified in Chromium: capture also
  // suppresses boundary events while held, so a drag off an armed hold ends it
  // at release rather than at the boundary crossing — matching touch, whose
  // implicit capture always worked that way.)

  test("capture makes a release far from the button end a hold begun during the permission prompt", async () => {
    const permission = deferred<void>();
    mockStartRecording.mockReturnValueOnce(permission.promise);
    renderExam();

    const captureSpy = vi.fn();
    mic().setPointerCapture = captureSpy;
    fireEvent.pointerDown(mic(), { pointerId: 7 });
    // The load-bearing half of the fix: capture is what routes a release that
    // happens outside the button back to it in a real browser.
    expect(captureSpy).toHaveBeenCalledWith(7);

    fireEvent.pointerLeave(mic());
    fireEvent.pointerUp(mic(), { pointerId: 7 });

    await act(async () => {
      permission.resolve();
      await flush();
    });

    expect(mockStopRecording).toHaveBeenCalled();
    expect(screen.getByText("Tap or hold to record")).toBeInTheDocument();
  });

  // A gesture the browser takes over (a touch slide becoming a scroll, palm
  // rejection, an app switch) fires pointercancel and then never fires
  // pointerup at all — capture cannot route a release that no longer exists.
  // During the prompt the cancel must complete the hold itself, or the
  // resolved start arms a mic with no release ever coming.
  test("a gesture cancelled during the permission prompt does not leave the mic hot", async () => {
    const permission = deferred<void>();
    mockStartRecording.mockReturnValueOnce(permission.promise);
    renderExam();

    fireEvent.pointerDown(mic());
    fireEvent.pointerCancel(mic());
    // Browsers follow pointercancel with pointerout/pointerleave.
    fireEvent.pointerLeave(mic());

    await act(async () => {
      permission.resolve();
      await flush();
    });

    expect(mockStopRecording).toHaveBeenCalled();
    expect(screen.getByText("Tap or hold to record")).toBeInTheDocument();
  });

  // With the finger still on the button there is no boundary crossing, so a
  // cancelled armed hold gets no pointerleave either — the cancel handler is
  // the only thing that can end it.
  test("a gesture cancelled during an armed hold ends the recording", async () => {
    renderExam();

    await act(async () => {
      fireEvent.pointerDown(mic());
      await flush();
    });
    now += 1500;
    await act(async () => {
      fireEvent.pointerCancel(mic());
      await flush();
    });

    expect(screen.getByText("88%")).toBeInTheDocument();
  });

  // Off the button, losing capture after a cancel replays the boundary
  // crossing as a trailing pointerleave. The stop must run once — a second
  // stopListening would see the cleared start time and report a spurious
  // "too short" on a recording that was already processed.
  test("the pointer-leave trailing a cancelled hold does not stop the recording twice", async () => {
    renderExam();

    await act(async () => {
      fireEvent.pointerDown(mic());
      await flush();
    });
    now += 1500;
    await act(async () => {
      fireEvent.pointerCancel(mic());
      fireEvent.pointerLeave(mic());
      await flush();
    });

    expect(mockStopRecording).toHaveBeenCalledTimes(1);
    expect(screen.getByText("88%")).toBeInTheDocument();
  });

  // The same replay after an ordinary release: a pointerup near the button's
  // edge is also followed by the boundary crossing capture had suppressed.
  // The guard is shared with the cancel path, but pin it from the up side too.
  test("the pointer-leave trailing a released hold does not stop the recording twice", async () => {
    renderExam();

    await act(async () => {
      fireEvent.pointerDown(mic());
      await flush();
    });
    now += 1500;
    await act(async () => {
      fireEvent.pointerUp(mic());
      fireEvent.pointerLeave(mic());
      await flush();
    });

    expect(mockStopRecording).toHaveBeenCalledTimes(1);
    expect(screen.getByText("88%")).toBeInTheDocument();
  });

  // Tap mode has no live gesture: the finger already lifted, so a cancel
  // arriving later (a second pointer's, or a stray one) must not end the
  // recording the tap deliberately left running.
  test("a pointer cancel while the mic is tap-armed leaves the recording running", async () => {
    renderExam();

    await act(async () => {
      fireEvent.pointerDown(mic());
      await flush();
    });
    now += 100;
    await act(async () => {
      fireEvent.pointerUp(mic());
      await flush();
    });
    expect(screen.getByText("Recording… tap to stop")).toBeInTheDocument();

    await act(async () => {
      fireEvent.pointerCancel(mic());
      await flush();
    });

    expect(mockStopRecording).not.toHaveBeenCalled();
    expect(screen.getByText("Recording… tap to stop")).toBeInTheDocument();
  });

  // Why pointer-leave must stay ignored while the start is pending: the finger
  // can drift off and drift back without ever letting go. Only the release
  // ends the hold — and captured, it reaches the button from anywhere.
  test("drifting off and back during the permission prompt keeps the hold alive", async () => {
    const permission = deferred<void>();
    mockStartRecording.mockReturnValueOnce(permission.promise);
    renderExam();

    fireEvent.pointerDown(mic());
    fireEvent.pointerLeave(mic());
    fireEvent.pointerEnter(mic());

    await act(async () => {
      permission.resolve();
      await flush();
    });
    expect(screen.getByText("Recording… tap to stop")).toBeInTheDocument();

    now += 1500;
    await act(async () => {
      fireEvent.pointerUp(mic());
      await flush();
    });
    expect(screen.getByText("88%")).toBeInTheDocument();
  });
});

// ─── Pointer ownership ────────────────────────────────────────────────────────
// Reviewer finding: none of the up/leave/cancel handlers checked e.pointerId,
// so any pointer's events acted on the single shared recording state. A palm
// edge grazing the ~96px button during the permission prompt lifted and ended
// the hold the primary finger still held; a second finger pressing during an
// armed hold restarted the recorder and discarded the live take; a mouse
// merely passing over the button during a touch hold fired its own
// pointerleave and stopped the hold. The gesture now belongs to the pointer
// that started it, and only that pointer's release/leave/cancel act on it.

describe("ExamView mic pointer ownership", () => {
  test("a second pointer's release during the permission prompt does not end the primary hold", async () => {
    const permission = deferred<void>();
    mockStartRecording.mockReturnValueOnce(permission.promise);
    renderExam();

    const captureSpy = vi.fn();
    mic().setPointerCapture = captureSpy;
    fireEvent.pointerDown(mic(), { pointerId: 1 });
    // A palm edge grazes the button and lifts; finger 1 is still holding.
    fireEvent.pointerDown(mic(), { pointerId: 2 });
    fireEvent.pointerUp(mic(), { pointerId: 2 });
    // Only the claiming pointer is captured — capturing the ignored one is
    // what used to retarget its off-button release back onto the button.
    expect(captureSpy).toHaveBeenCalledWith(1);
    expect(captureSpy).not.toHaveBeenCalledWith(2);

    await act(async () => {
      permission.resolve();
      await flush();
    });

    // The hold must arm and stay armed for the finger that owns it.
    expect(mockStopRecording).not.toHaveBeenCalled();
    expect(screen.getByText("Recording… tap to stop")).toBeInTheDocument();

    now += 1500;
    await act(async () => {
      fireEvent.pointerUp(mic(), { pointerId: 1 });
      await flush();
    });
    expect(screen.getByText("88%")).toBeInTheDocument();
  });

  test("a second pointer pressing during an armed hold neither restarts nor stops the recording", async () => {
    renderExam();

    await act(async () => {
      fireEvent.pointerDown(mic(), { pointerId: 1 });
      await flush();
    });
    expect(screen.getByText("Recording… tap to stop")).toBeInTheDocument();

    now += 50;
    await act(async () => {
      fireEvent.pointerDown(mic(), { pointerId: 2 });
      fireEvent.pointerUp(mic(), { pointerId: 2 });
      await flush();
    });

    // Starting again would have discarded the live recorder mid-take.
    expect(mockStartRecording).toHaveBeenCalledTimes(1);
    expect(mockStopRecording).not.toHaveBeenCalled();
    expect(screen.getByText("Recording… tap to stop")).toBeInTheDocument();

    now += 1450;
    await act(async () => {
      fireEvent.pointerUp(mic(), { pointerId: 1 });
      await flush();
    });
    expect(screen.getByText("88%")).toBeInTheDocument();
  });

  test("another pointer's leave during an armed hold does not end it", async () => {
    renderExam();

    await act(async () => {
      fireEvent.pointerDown(mic(), { pointerId: 5 });
      await flush();
    });

    // A mouse glides across the button while the touch hold is armed.
    now += 50;
    await act(async () => {
      fireEvent.pointerLeave(mic(), { pointerId: 1 });
      await flush();
    });
    expect(mockStopRecording).not.toHaveBeenCalled();
    expect(screen.getByText("Recording… tap to stop")).toBeInTheDocument();

    now += 1450;
    await act(async () => {
      fireEvent.pointerUp(mic(), { pointerId: 5 });
      await flush();
    });
    expect(screen.getByText("88%")).toBeInTheDocument();
  });

  // The safety valve the ownership gate must not break: without capture (the
  // call is unavailable or threw) the owning release can land off-button and
  // never reach these handlers, leaving an armed hold and a stale owner id.
  // Only a mouse can get here — touch and pen receive implicit capture, so
  // their release always retargets to the button — and a mouse keeps a stable
  // pointerId. The same pointer pressing again is proof the old gesture ended
  // (a pointer cannot press twice while down), so the press reclaims the mic
  // — restarting the recording, exactly as before this fix — instead of
  // finding it permanently inert until remount.
  test("a press by the stale owning pointer reclaims a hold whose release was lost", async () => {
    renderExam();

    await act(async () => {
      fireEvent.pointerDown(mic(), { pointerId: 1 });
      await flush();
    });
    // The release happened off-button and never arrived: the hold is armed,
    // nobody is holding, and pointer 1 still owns it. The same mouse presses
    // again.
    await act(async () => {
      fireEvent.pointerDown(mic(), { pointerId: 1 });
      await flush();
    });
    expect(mockStartRecording).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Recording… tap to stop")).toBeInTheDocument();

    now += 1500;
    await act(async () => {
      fireEvent.pointerUp(mic(), { pointerId: 1 });
      await flush();
    });
    expect(screen.getByText("88%")).toBeInTheDocument();
  });
});
