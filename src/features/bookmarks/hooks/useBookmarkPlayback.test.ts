import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useBookmarkPlayback } from "./useBookmarkPlayback";

// BM-02 — on a voice-less pack (capabilities.tts === false), useGoogleTTS's
// speakText already no-ops internally, but this hook used to call it anyway
// for a no-audio phrase/message, which read as "success" with nothing
// playing. PhraseCard/SessionViewer now hide the control for that case, and
// this hook guards the same condition itself as defense-in-depth.

const mockPlayDataUrl = vi.fn<(url: string) => Promise<void>>();
const mockSpeakText = vi.fn<(text: string, voice?: string) => Promise<void>>();

vi.mock("../../../hooks/audio", () => ({
  playDataUrl: (url: string) => mockPlayDataUrl(url),
}));

vi.mock("../../../hooks/useGoogleTTS", () => ({
  speakText: (...args: [string, string | undefined]) => mockSpeakText(...args),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockPlayDataUrl.mockResolvedValue(undefined);
  mockSpeakText.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("useBookmarkPlayback.handleSpeak — BM-02", () => {
  test("skips speakText for a phrase with no stored audio when TTS is unavailable", async () => {
    const { result } = renderHook(() =>
      useBookmarkPlayback({ sessions: [], userProfile: null, ttsEnabled: false })
    );

    await act(async () => result.current.handleSpeak("p1", "hello"));

    expect(mockSpeakText).not.toHaveBeenCalled();
    expect(mockPlayDataUrl).not.toHaveBeenCalled();
    expect(result.current.playingId).toBeNull();
  });

  test("falls back to speakText when TTS is available", async () => {
    const { result } = renderHook(() =>
      useBookmarkPlayback({ sessions: [], userProfile: null, ttsEnabled: true })
    );

    await act(async () => result.current.handleSpeak("p1", "hello"));

    expect(mockSpeakText).toHaveBeenCalledWith("hello", undefined);
  });

  test("plays stored audio even when TTS is unavailable", async () => {
    const { result } = renderHook(() =>
      useBookmarkPlayback({ sessions: [], userProfile: null, ttsEnabled: false })
    );

    await act(async () => result.current.handleSpeak("p1", "hello", "data:audio/wav;base64,AAA"));

    expect(mockPlayDataUrl).toHaveBeenCalledWith("data:audio/wav;base64,AAA");
    expect(mockSpeakText).not.toHaveBeenCalled();
  });
});

describe("useBookmarkPlayback.playMessage — BM-02", () => {
  test("skips speakText for a message with no stored audio when TTS is unavailable", async () => {
    const { result } = renderHook(() =>
      useBookmarkPlayback({ sessions: [], userProfile: null, ttsEnabled: false })
    );

    await act(async () => result.current.playMessage("m1", undefined, undefined, "fallback text"));

    expect(mockSpeakText).not.toHaveBeenCalled();
    expect(result.current.playingId).toBeNull();
  });

  test("falls back to speakText when TTS is available", async () => {
    const { result } = renderHook(() =>
      useBookmarkPlayback({ sessions: [], userProfile: null, ttsEnabled: true })
    );

    await act(async () => result.current.playMessage("m1", undefined, undefined, "fallback text"));

    expect(mockSpeakText).toHaveBeenCalledWith("fallback text", undefined);
  });
});
