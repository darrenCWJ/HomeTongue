# ml/train — training-run scaffolding for the dialect model roadmap

> **READ THIS FIRST: THE DATABASE CURRENTLY HAS ZERO CONSENTED SAMPLES.**
> Nothing in this directory can be run against real data yet. Everything that
> could be tested without data or a GPU **has been** (the dataset-prep scripts,
> against checked-in fixtures); everything else is a reviewed scaffold marked
> **untested until data**. Each subdirectory README repeats this and says
> exactly which files are which.

Companion to `docs/ML_TRAINING_PLAN.md` (the four-step plan) and
`docs/ML_PIPELINE.md` (consent + collection). Step 1 (eval harness, synthetic
generator, retrieval prompting, provider switches) is already shipped in
`ml/eval/`, `ml/data/`, and `api/`. This directory scaffolds steps 2–4 so that
when the data exists, each training step is a documented one-command job.

```
ml/train/
├── whisper-lora/          step 2 — Cantonese STT fine-tune (prep TESTED; train/serve scaffolds)
│   └── serve/             FastAPI server for the transcribeCore STT contract + deploy notes
├── slm-dialogue/          step 3 — dialogue SLM SFT + DPO (prep TESTED; train scaffolds)
└── pronunciation-scorer/  step 4 — DESIGN.md only (furthest out)
```

Python scripts use stdlib `argparse`, are import-side-effect-free, and fail
fast with a clear message when inputs are missing. The prep scripts are
stdlib-only (no pip install needed); training scripts have per-directory
`requirements.txt` (loose pins) for the GPU box.

## Prerequisites per step (data gates, not calendar time)

| Step | Worth running at | Compute | Ballpark cost |
|---|---|---|---|
| 2. Whisper LoRA | ~1–2k consented samples ≈ 5–15 h learner audio (each consented exam attempt ≈ 10 s) | 1× A10/T4, hours | $20–100 per experiment; ~$30–80/mo serverless GPU serving |
| 3. SLM SFT+DPO | ~3–5k ratings/corrections + a filtered synthetic corpus (hundreds of dialogues) | 1× A100, hours | $50–300 per run; serving from ~$1/hr active |
| 4. Pronunciation scorer | after step 2 ships; ≥ 10–20 h reviewed audio with retention consent | mostly CPU + small GPU | < $100 |

Track experiments in Weights & Biases (free tier). The step-1 harness
(`ml/eval/evaluate_stt.mjs`) is the single source of truth for "is the custom
STT model actually better".

## The end-to-end sequence

1. **Flip cloud mode** — deploy with `VITE_STORAGE_MODE=cloud` +
   `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`. Consent flags are default-OFF
   toggles in Profile settings; RLS re-enforces them server-side
   (`supabase/migrations/0002`).
2. **Collect** — consented exam attempts and chat edits accumulate in
   `speech_samples` / `corrections` (audio only with `audio_retention_consent`).
3. **Review in the admin app** — reviewers (`profiles.is_admin`) verify/correct
   samples into `sample_reviews` (migration 0005).
   `scripts/export-training-data.mjs` joins those verdicts into the export
   (`review_verdict` / `review_corrected_text`; rejected samples are excluded
   by default, `--include-rejected` keeps them), and `prepare_data.py`
   prefers review-corrected text when selecting references.
4. **Export** — `node scripts/export-training-data.mjs --language yue-HK --out
   training-export/` (service-role key; trusted machine only), plus a mirror of
   the `recordings` bucket for audio.
5. **Prepare** — `whisper-lora/prepare_data.py` (speaker-hash split manifests),
   `slm-dialogue/prepare_sft_data.py` + `prepare_dpo_data.py`. Optionally
   append an external video corpus (`ml/data/video/`, see its README) onto
   `train.jsonl` — never onto val, which stays real learner audio.
6. **Train** — `whisper-lora/train.py`, `slm-dialogue/train_sft.py` /
   `train_dpo.py`; always `--dry-run` first on the GPU box.
7. **Eval-gate with the existing harness** — for STT:
   `whisper-lora/transcribe_for_eval.py` writes harness-shaped JSONL, then
   `node ml/eval/evaluate_stt.mjs --in …`; ship bar ≥ 15–20 % relative CER
   reduction vs the gpt-4o-transcribe baseline on held-out speakers. For the
   SLM: frontier-judge side-by-side, then a live A/B on thumbs.
8. **Env flip** — preview deployment first: `STT_BASE_URL_YUE_HK` (+
   `STT_API_KEY`) for STT, `LLM_BASE_URL_YUE_HK` (+ `LLM_API_KEY`,
   `OPENAI_MODEL`) for the SLM. Rollback = unset the variable; OpenAI is the
   always-working default and the client never changes.

## Outputs & hygiene

Generated artifacts (`data/`, `checkpoints/`, exports, audio mirrors) are
git-ignored via `ml/train/.gitignore` — never commit user audio or corpus
exports, even anonymized ones. The service-role key and endpoint bearer
secrets live only in CI/host secret stores.
