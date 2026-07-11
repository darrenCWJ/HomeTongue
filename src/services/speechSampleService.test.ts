import { describe, expect, test } from "vitest";
import type { UserProfile } from "../types";
import {
  buildCorrectionRow,
  buildRecordingPath,
  buildSpeechSampleRow,
  consentFromProfile,
  recordCorrection,
  recordSpeechSample,
} from "./speechSampleService";

const USER_ID = "11111111-2222-3333-4444-555555555555";

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: USER_ID,
    name: "",
    preferredDialect: "Cantonese",
    preferredTone: "casual",
    toneOverrideEnabled: false,
    personalityNotes: "",
    conversationCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("consentFromProfile", () => {
  test("maps granted flags through and defaults absent flags to false", () => {
    expect(
      consentFromProfile(makeProfile({ dataCollectionConsent: true, audioRetentionConsent: true }))
    ).toStrictEqual({ data: true, audio: true });
    expect(consentFromProfile(makeProfile())).toStrictEqual({ data: false, audio: false });
    expect(consentFromProfile(null)).toStrictEqual({ data: false, audio: false });
    expect(consentFromProfile(undefined)).toStrictEqual({ data: false, audio: false });
  });
});

describe("buildSpeechSampleRow", () => {
  test("builds a fully populated exam row", () => {
    // Arrange
    const input = {
      source: "exam" as const,
      expectedText: "唔該晒",
      transcript: "唔該",
      score: 72,
    };

    // Act
    const row = buildSpeechSampleRow(input, {
      userId: USER_ID,
      language: "yue-HK",
      audioUrl: `${USER_ID}/abc.wav`,
    });

    // Assert
    expect(row).toStrictEqual({
      user_id: USER_ID,
      language: "yue-HK",
      source: "exam",
      expected_text: "唔該晒",
      transcript: "唔該",
      corrected_text: null,
      score: 72,
      stt_model: "gpt-4o-transcribe",
      audio_url: `${USER_ID}/abc.wav`,
      device: "web",
    });
  });

  test("nulls absent optionals and clamps out-of-range scores", () => {
    const base = { source: "chat" as const, transcript: "你好" };
    const meta = { userId: USER_ID, language: "yue-HK", audioUrl: null };

    expect(buildSpeechSampleRow(base, meta).expected_text).toBeNull();
    expect(buildSpeechSampleRow(base, meta).score).toBeNull();
    expect(buildSpeechSampleRow(base, meta).audio_url).toBeNull();
    expect(buildSpeechSampleRow({ ...base, score: 130 }, meta).score).toBe(100);
    expect(buildSpeechSampleRow({ ...base, score: -5 }, meta).score).toBe(0);
    expect(buildSpeechSampleRow({ ...base, score: 87.5 }, meta).score).toBe(88);
  });
});

describe("buildCorrectionRow", () => {
  test("builds a transcript-edit row", () => {
    const row = buildCorrectionRow(
      { kind: "transcript_edit", original: "I want tea", corrected: "I want milk tea" },
      { userId: USER_ID, language: "yue-HK" }
    );
    expect(row).toStrictEqual({
      user_id: USER_ID,
      language: "yue-HK",
      kind: "transcript_edit",
      original: "I want tea",
      corrected: "I want milk tea",
      rating: null,
      context: null,
    });
  });

  test("builds a suggestion-rating row with null corrected text", () => {
    const row = buildCorrectionRow(
      { kind: "suggestion_rating", original: "好耐冇見", rating: "up" },
      { userId: USER_ID, language: "yue-HK" }
    );
    expect(row.kind).toBe("suggestion_rating");
    expect(row.rating).toBe("up");
    expect(row.corrected).toBeNull();
  });
});

describe("buildRecordingPath", () => {
  test("scopes the object under the user's folder with a .wav extension", () => {
    expect(buildRecordingPath(USER_ID, "abc-123")).toBe(`${USER_ID}/abc-123.wav`);
  });
});

describe("no-op gating (Supabase not configured in the test environment)", () => {
  test("recordSpeechSample returns without throwing regardless of consent", () => {
    expect(() =>
      recordSpeechSample(
        { source: "exam", expectedText: "你好", transcript: "你好", score: 100 },
        { data: true, audio: true }
      )
    ).not.toThrow();
    expect(() =>
      recordSpeechSample({ source: "chat", transcript: "你好" }, { data: false, audio: false })
    ).not.toThrow();
  });

  test("recordCorrection returns without throwing regardless of consent", () => {
    expect(() =>
      recordCorrection(
        { kind: "transcript_edit", original: "a", corrected: "b" },
        { data: true, audio: false }
      )
    ).not.toThrow();
    expect(() =>
      recordCorrection(
        { kind: "suggestion_rating", original: "a", rating: "down" },
        { data: false, audio: false }
      )
    ).not.toThrow();
  });
});
