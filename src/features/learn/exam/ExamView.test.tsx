import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
});
