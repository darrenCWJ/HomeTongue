# ML training plan — dialect conversation models

Companion to `docs/ML_PIPELINE.md` (which covers data collection). This plans the four training steps. **No separate app is needed**: training lives in an `ml/` folder in this repo, heavy compute runs on rented cloud GPUs (Modal / RunPod / Colab), and finished models serve behind the existing `/api/*` contracts via env-var provider switches — the web/mobile app never changes.

```
hometongue/
├── src/, api/            ← unchanged; api gains env-gated provider switches
└── ml/                   ← new: training & eval code (no runtime coupling to the app)
    ├── eval/             ← step 1: STT benchmark harness
    ├── data/             ← exports, synthetic generation, dataset builds
    ├── whisper/          ← step 2: LoRA fine-tune configs
    └── slm/              ← step 3: SFT + DPO configs (LLaMA-Factory)
```

Progress is gated on **data volume, not calendar time** — each step starts when its data threshold is met.

---

## Step 1 — Eval harness + retrieval prompting (now; $0; no GPU)

Goal: make every later decision measurable, and improve conversation quality immediately without training.

1. **STT benchmark harness** (`ml/eval/`): consume `scripts/export-training-data.mjs` output; compute CER/WER between `expected_text` and `transcript` using the same char-equivalence normalization as the app's scorer (Mandarin↔Cantonese map, particle groups — import from the language pack); report per-source, per-speaker-hash, and score-vs-CER correlation. This snapshots the **gpt-4o-transcribe baseline** that any fine-tune must beat.
2. **Retrieval few-shot for conversation**: inject the signed-in user's own high-signal data (top-rated suggestions, transcript corrections, saved phrases) as few-shot examples into the `/api/chat` prompts built by `suggestionService`/`translationService`. This usually beats fine-tuning at small data scale and tells us which data has signal.
3. **Synthetic dialogue generator** (`ml/data/`): frontier-model generation of HK-colloquial dialogues constrained by the language pack rules (particles, 唔/係/嘅/呢個 usage), auto-filtered by the scoring maps. Builds the SFT corpus for step 3 before user data reaches scale.
4. **Grow the corpus**: consent prompts in-product; every exam attempt with consent ≈ 10s of labeled audio.

**Status (2026-07-12)**: harness, generator, retrieval prompting, and both provider switches are SHIPPED (`ml/eval/`, `ml/data/`, suggestion personalization, `LLM_BASE_URL`/`STT_BASE_URL` in `api/`). Remaining exit criteria: run the first baseline report once ≥ 500 consented exam samples exist.

Usage:
```bash
node ml/eval/build-normalization.mjs                 # regen after language-pack changes
node scripts/export-training-data.mjs --out training-export   # needs SUPABASE_SERVICE_ROLE_KEY
node ml/eval/evaluate_stt.mjs --in training-export/speech_samples.jsonl
OPENAI_API_KEY=... node ml/data/generate-synthetic-dialogues.mjs --count 50
```

## Step 2 — Whisper LoRA fine-tune (at ~1–2k samples / 5–15 h learner audio)

The unique data moat: **learner-accented Cantonese** — public corpora are native speakers; our users are heritage learners, which is exactly where current STT fails.

- **Recipe**: HF Transformers + PEFT LoRA on `whisper-small` → `medium`. Pre-mix public native corpora (Common Voice `yue`, MDCC ~73 h) then adapt on our exam audio (already 16 kHz mono WAV — no preprocessing needed). Split train/val **by speaker hash** to avoid leakage.
- **Compute**: single A10/T4 (Modal or RunPod), roughly $20–100 per experiment.
- **Evaluate**: step-1 harness, held-out learner audio. Ship bar: ≥ 15–20 % relative CER reduction vs the frontier baseline.
- **Serve**: faster-whisper + LoRA on a Modal serverless GPU endpoint; `api/transcribe.js` gains `STT_PROVIDER=custom` + `CUSTOM_STT_URL/KEY` env switch (defaults to OpenAI — zero risk).

## Step 3 — Conversation SLM: SFT + DPO (at ~3–5k ratings/corrections + synthetic corpus)

Honest framing: below ~50k quality examples a fine-tuned small model rarely beats frontier-plus-good-prompting — which is why step 1's retrieval layer comes first and why **the thumbs up/down ratings we already collect are the real asset** (preference data).

- **Base model**: a Cantonese-capable open model — Qwen-class instruct, or a community Cantonese LLM (Yi/Qwen-based) as the starting point. Never from scratch.
- **Recipe**: LLaMA-Factory (or axolotl) LoRA SFT on the synthetic + corrected corpus, then **DPO** on collected ratings. Single A100-class run, ~$50–300.
- **Evaluate**: frontier-judge side-by-side on held-out prompts, plus a live A/B behind an env flag with real thumbs as the metric.
- **Serve**: vLLM on Modal (or a managed custom-model host) behind an `LLM_PROVIDER` switch in `api/chat.js`.

## Step 4 — Jyutping-level pronunciation scoring (research-flavored; after 1–2)

Today the exam scores *transcripts*: perfect words with wrong tones score 100. The real version scores audio:

1. Forced alignment of the recording against expected Jyutping (Montreal Forced Aligner with a Cantonese lexicon/acoustic model).
2. Per-syllable goodness-of-pronunciation scores + a small tone classifier (wav2vec2 features) trained on native corpora, weakly supervised by our stored exam scores and corrections.
3. Serve as a new `api/score-pronunciation` endpoint; the exam UI gains syllable-level feedback ("your tone 3 sounded like tone 5 on 嗰").

This is the feature no competitor has, and it reuses all step-1/2 infrastructure.

---

## Cost & infrastructure summary

| Step | Compute | Est. cost | Trigger |
|---|---|---|---|
| 1 | none (Node scripts + API calls) | ~$0 + LLM tokens for synthetic data | now |
| 2 | 1× A10/T4, hours | $20–100/experiment; ~$30–80/mo serving (serverless GPU) | ~1–2k samples |
| 3 | 1× A100, hours | $50–300/run; serving from ~$1/hr active | ~3–5k preference pairs |
| 4 | small; mostly CPU alignment + small GPU | <$100 | after 2 |

Tracking: Weights & Biases (free tier) for training runs; the step-1 harness is the single source of truth for "is the custom model actually better".

## The serving principle (why the app never changes)

Every model swap happens inside `api/*` behind env flags with the OpenAI path as the always-working default. Rollout = flip env var on a preview deployment → verify with the harness + live use → flip in production. Rollback = flip it back.
