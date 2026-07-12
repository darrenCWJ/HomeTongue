/**
 * Language pack contract (Phase 4 groundwork).
 *
 * Everything dialect-specific — TTS voices, STT hints, AI prompt templates,
 * and offline scoring data — lives in a pack under `src/languages/<code>/`.
 * Adding a new dialect means writing one pack and registering it in
 * `src/languages/index.ts`; services and hooks read from the active pack.
 */

export interface GoogleTTSVoice {
  name: string;
  gender: "female" | "male";
  style: string;
}

/**
 * Curated voice entry surfaced in voice-picker UIs (onboarding, profile).
 * `key` must exist in the pack's `tts.voices` registry.
 */
export interface DisplayVoice {
  /** Voice key into the pack's `tts.voices` registry. */
  key: string;
  /** Friendly display name shown to the user, e.g. "Jamie". */
  label: string;
  gender: "female" | "male";
  /** One-word style tag, e.g. "Bright". */
  style: string;
  /** Short blurb describing the voice. */
  description: string;
}

export interface LanguagePack {
  /** BCP-47 language code, e.g. "yue-HK". */
  code: string;
  /** Human-readable dialect name, e.g. "Cantonese". */
  label: string;
  /** Single-character glyph shown in the dialect picker, e.g. "粵". */
  character: string;

  tts: {
    /** `languageCode` sent to /api/tts. */
    languageCode: string;
    /** Available Google Cloud TTS voices, keyed by app-level voice key. */
    voices: Readonly<Record<string, GoogleTTSVoice>>;
    /**
     * Curated subset of `voices` shown in voice-picker UIs, in display order.
     * Every `key` must exist in `voices` (asserted in src/languages/packs.test.ts).
     */
    displayVoices: ReadonlyArray<DisplayVoice>;
    /** Voice key used when none is selected or a stored key is invalid. */
    defaultVoice: string;
    /** Legacy provider voice IDs (ElevenLabs) → voice key, for old stored profiles. */
    legacyVoiceMap: Readonly<Record<string, string>>;
  };

  stt: {
    /** Language hint sent to /api/transcribe, e.g. "zh". */
    language: string;
    /** Hallucination-guard prompt fed to the transcription model. */
    prompt: string;
  };

  romanization: {
    /** Romanization system named in the prompt templates, e.g. "Jyutping". */
    name: string;
  };

  script: {
    /** Writing-system name used in the prompt templates, e.g. "Traditional Chinese". */
    name: string;
  };

  prompts: {
    /** System prompt for the 3-tone translation JSON response. */
    translateSystem: string;
    /** System prompt for per-segment word breakdown. */
    breakdownSystem: string;
    /** Builds the pronunciation-scoring rubric for an expected phrase length. */
    buildScoringSystem: (charCount: number) => string;
    /** System prompt for example-sentence translation + romanization. */
    exampleMetaSystem: string;
  };

  scoring: {
    /** Cross-dialect character equivalents (e.g. Mandarin → Cantonese). */
    charEquivalents: Readonly<Record<string, string>>;
    /** Interchangeable sentence-final particles; the first entry is canonical. */
    particleGroups: ReadonlyArray<readonly string[]>;
  };
}
