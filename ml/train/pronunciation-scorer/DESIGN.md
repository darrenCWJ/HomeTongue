# Step 4 — Jyutping-level pronunciation scoring (DESIGN ONLY)

> **STATUS: DESIGN DOCUMENT, NO CODE.** This is the furthest-out step
> (docs/ML_TRAINING_PLAN.md step 4, "after 1–2"). It depends on the Whisper
> fine-tune infrastructure (step 2) and on a much larger consented audio
> corpus than the current **zero samples**.
>
> **Expanded by [docs/ML_TONE_ACCURACY_DESIGN.md](../../../docs/ML_TONE_ACCURACY_DESIGN.md)**
> — the full architecture, data-integration, and reinforcement-loop report
> (tiered corpus, PyTorch/LoRA training stages, eval gates, diagrams).

## Why

Today the exam scores *transcripts*, not audio:
`scoreDialectAccuracy(expected, actual)` in `src/services/translationService.ts`
sends the expected phrase and the STT transcript to the LLM
(`pack.prompts.buildScoringSystem`) and falls back to the pack's
character-match scorer (`pack.scoring.fallbackMatch`). Consequence: a learner
who says every word with wrong tones — the canonical heritage-learner failure
mode — can still score 100, because the STT output happens to match. The real
version scores the **recording** against the expected **Jyutping**, per
syllable, tones included.

## Data requirements (gates before starting)

| Need | Source | Threshold |
|---|---|---|
| Learner recordings with trusted labels | `speech_samples` + `sample_reviews` (audio kept only with `audio_retention_consent`) | ≥ 10–20 h reviewed learner audio |
| Expected Jyutping per phrase | lesson content (`src/data/lessons.ts` carries jyutping) + `getExampleMeta` pronunciations; a canonical lexicon fills gaps | full coverage of exam phrases |
| Native reference corpora for tone modeling | Common Voice `yue`, MDCC (~73 h) — public | available now |
| Weak supervision signal | stored exam `score` + reviewer verdicts | grows with step-2 collection |

## Approach

### 1. Forced alignment — Montreal Forced Aligner (MFA)

- MFA with a Cantonese acoustic model + Jyutping-romanized pronunciation
  lexicon aligns each 16 kHz exam clip against the expected phrase, yielding
  per-syllable time boundaries.
- Alignment failure (no path, or grossly compressed segments) is itself a
  strong "did not say the expected phrase" signal — report it instead of a
  fabricated score.

### 2. Per-syllable scoring

- **Segmental (initial/final) quality**: goodness-of-pronunciation (GOP)
  scores from the aligner's acoustic model posteriors — no training required
  for a v1.
- **Tone classifier**: the discriminative piece MFA cannot give. A small head
  (2–3 layer MLP) over frozen wav2vec2 features per aligned syllable,
  classifying the 6 Cantonese tones. Train on native corpora (labels come free
  from the Jyutping transcripts), then calibrate on learner audio, weakly
  supervised by stored exam scores and reviewer corrections.
- Output per syllable: `{syllable, expectedTone, predictedTone, toneConfidence,
  gop}` → phrase score = weighted aggregate; tone errors weighted heaviest
  (they carry meaning in Cantonese).

### 3. Serving sketch

Same pattern as steps 2/3 — a GPU endpoint behind an env-gated proxy:

- New serverless function `api/score-pronunciation.js` forwarding
  `{audio (base64 WAV), expected, jyutping, language}` to
  `SCORER_BASE_URL(_YUE_HK)` with a `SCORER_API_KEY` bearer — mirroring
  `resolveBaseUrl()` in `api/_lib/languageManifest.js` (add a `"scorer"` kind).
- Response: `{score, syllables: [{syllable, expectedTone, predictedTone,
  toneConfidence, gop}], aligned: boolean}`.
- Alignment is CPU-heavy but small — a modest instance suffices; the tone
  classifier is tiny. Estimated cost < $100 total (plan's table).

### 4. App integration

- `scoreDialectAccuracy` keeps working unchanged (transcript-based fallback —
  it is also the offline/mock path).
- The exam flow (`src/features/learn/exam/ExamView.tsx`) already captures the
  recording for STT; when the scorer endpoint is configured, it additionally
  posts the same WAV to `/api/score-pronunciation` and renders syllable-level
  feedback ("your tone 3 sounded like tone 5 on 嗰"), falling back silently to
  the transcript score when unconfigured — the same config-gated degradation
  pattern the app uses everywhere.
- New per-syllable results are also candidate ML-capture rows
  (consent-gated, like `speechSampleService`).

## Open questions

- MFA Cantonese acoustic model quality on *learner* (accented) audio is
  unproven — may need adaptation on our corpus before GOP is trustworthy.
- Jyutping source of truth: lesson data vs. a canonical lexicon (words with
  multiple readings, tone sandhi like 變調 in compounds).
- Whether tone classification should condition on speaker baseline pitch
  (heritage learners' pitch ranges vary widely) — likely yes; per-clip
  normalization first.
- Latency budget: alignment + scoring must fit the exam UX (< ~3 s perceived).

## Non-goals (v1)

- No free-speech scoring — only known expected phrases (exam mode).
- No prosody/fluency scoring beyond per-syllable tone + GOP.
- No on-device inference.
