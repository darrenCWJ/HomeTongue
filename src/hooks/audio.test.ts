import "@testing-library/jest-dom/vitest";
import { StrictMode } from "react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useAudioRecorder } from "./audio";

// Folded item A (residual leak from Task 8's review) — startRecording's
// "stop the existing recorder" cleanup runs synchronously BEFORE its own
// getUserMedia await, so two calls that overlap one permission prompt both saw
// an empty mediaRecorderRef and each created a recorder. Whichever resolved
// last overwrote the ref; the other kept recording with nothing able to reach
// it — a hot mic until reload. Starts must serialize so each call's cleanup
// sees its actual predecessor.

/** A promise plus its resolver, so a test can hold getUserMedia mid-prompt. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class FakeTrack {
  stopped = false;
  stop() {
    this.stopped = true;
  }
}

class FakeStream {
  readonly tracks = [new FakeTrack(), new FakeTrack()];
  getTracks() {
    return this.tracks;
  }
}

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported = () => true;

  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(readonly stream: FakeStream) {
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.onstop?.();
  }
}

const getUserMedia = vi.fn();

/** Recorders still capturing audio — more than one means an orphaned mic. */
const liveRecorders = () => FakeMediaRecorder.instances.filter((r) => r.state === "recording");

const allTracksStopped = (stream: FakeStream) => stream.getTracks().every((t) => t.stopped);

beforeEach(() => {
  FakeMediaRecorder.instances = [];
  getUserMedia.mockReset();
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useAudioRecorder overlapping starts", () => {
  test("leaves exactly one live recorder when the first prompt is answered first", async () => {
    const first = deferred<FakeStream>();
    const second = deferred<FakeStream>();
    const streamA = new FakeStream();
    const streamB = new FakeStream();
    getUserMedia.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useAudioRecorder());

    // Both mics arm while a single permission prompt is still up.
    let firstStart!: Promise<void>;
    let secondStart!: Promise<void>;
    act(() => {
      firstStart = result.current.startRecording();
      secondStart = result.current.startRecording();
    });

    await act(async () => {
      first.resolve(streamA);
      second.resolve(streamB);
      await firstStart;
      await secondStart;
    });

    const live = liveRecorders();
    expect(live).toHaveLength(1);
    const orphaned = FakeMediaRecorder.instances.filter((r) => r !== live[0]);
    orphaned.forEach((recorder) => expect(allTracksStopped(recorder.stream)).toBe(true));
  });

  test("leaves exactly one live recorder when the second prompt is answered first", async () => {
    const first = deferred<FakeStream>();
    const second = deferred<FakeStream>();
    const streamA = new FakeStream();
    const streamB = new FakeStream();
    getUserMedia.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useAudioRecorder());

    let firstStart!: Promise<void>;
    let secondStart!: Promise<void>;
    act(() => {
      firstStart = result.current.startRecording();
      secondStart = result.current.startRecording();
    });

    await act(async () => {
      second.resolve(streamB);
      first.resolve(streamA);
      await firstStart;
      await secondStart;
    });

    const live = liveRecorders();
    expect(live).toHaveLength(1);
    const orphaned = FakeMediaRecorder.instances.filter((r) => r !== live[0]);
    orphaned.forEach((recorder) => expect(allTracksStopped(recorder.stream)).toBe(true));
  });

  test("the surviving recorder is the one stopRecording returns audio from", async () => {
    const streamA = new FakeStream();
    const streamB = new FakeStream();
    getUserMedia.mockResolvedValueOnce(streamA).mockResolvedValueOnce(streamB);
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      const firstStart = result.current.startRecording();
      const secondStart = result.current.startRecording();
      await firstStart;
      await secondStart;
    });

    const live = liveRecorders();
    expect(live).toHaveLength(1);
    await act(async () => {
      await result.current.stopRecording();
    });
    expect(allTracksStopped(streamA)).toBe(true);
    expect(allTracksStopped(streamB)).toBe(true);
  });
});

describe("useAudioRecorder sequential use", () => {
  test("a start then stop returns the recording and releases the mic", async () => {
    const stream = new FakeStream();
    getUserMedia.mockResolvedValue(stream);
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.startRecording();
    });
    expect(FakeMediaRecorder.instances).toHaveLength(1);
    expect(FakeMediaRecorder.instances[0].state).toBe("recording");

    let blob!: Blob;
    await act(async () => {
      blob = await result.current.stopRecording();
    });

    expect(blob.type).toBe("audio/webm");
    expect(allTracksStopped(stream)).toBe(true);
  });

  test("a denied permission does not deadlock the next start", async () => {
    getUserMedia.mockRejectedValueOnce(new Error("denied")).mockResolvedValueOnce(new FakeStream());
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await expect(result.current.startRecording()).rejects.toThrow("denied");
    });
    await act(async () => {
      await result.current.startRecording();
    });

    expect(liveRecorders()).toHaveLength(1);
  });

  test("re-starting while a recorder is live releases the previous mic", async () => {
    const streamA = new FakeStream();
    const streamB = new FakeStream();
    getUserMedia.mockResolvedValueOnce(streamA).mockResolvedValueOnce(streamB);
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.startRecording();
    });
    await act(async () => {
      await result.current.startRecording();
    });

    expect(liveRecorders()).toHaveLength(1);
    expect(allTracksStopped(streamA)).toBe(true);
  });
});

// The unmount cleanup can only release what mediaRecorderRef holds — and while
// a start is awaiting the permission prompt, it holds nothing. Unmounting in
// that window (press the mic, navigate away before answering the prompt) must
// not let the resolving start arm a recorder no cleanup can ever reach.
describe("useAudioRecorder unmount during a pending start", () => {
  test("an unmount while the permission prompt is up releases the stream and never arms", async () => {
    const pending = deferred<FakeStream>();
    const stream = new FakeStream();
    getUserMedia.mockReturnValueOnce(pending.promise);
    const { result, unmount } = renderHook(() => useAudioRecorder());

    let start!: Promise<void>;
    act(() => {
      start = result.current.startRecording();
    });

    unmount();

    await act(async () => {
      pending.resolve(stream);
      await start;
    });

    expect(liveRecorders()).toHaveLength(0);
    expect(allTracksStopped(stream)).toBe(true);
  });

  test("StrictMode's mount-unmount-mount cycle leaves a later start working", async () => {
    // StrictMode replays mount → cleanup → mount on the SAME ref objects, so a
    // cleanup that latches "unmounted" without the effect body re-arming it
    // would permanently disable recording in dev.
    const stream = new FakeStream();
    getUserMedia.mockResolvedValue(stream);
    const { result } = renderHook(() => useAudioRecorder(), { wrapper: StrictMode });

    await act(async () => {
      await result.current.startRecording();
    });

    expect(liveRecorders()).toHaveLength(1);
  });
});
