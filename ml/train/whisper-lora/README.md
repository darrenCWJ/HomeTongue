# Step 2 — Whisper LoRA fine-tune (Cantonese learner STT)

> **STATUS: THE DATABASE HAS ZERO SAMPLES.** Nothing here can run against real
> data yet. What IS tested today: `prepare_data.py` against the checked-in
> fixture (command below). `train.py`, `transcribe_for_eval.py`, and `serve/`
> are reviewed scaffolds, **untested until data** — expect to shake out minor
> issues on the first real run.

Trigger (docs/ML_TRAINING_PLAN.md): ~1–2k consented samples / 5–15 h of learner
audio. Compute: one A10/T4 (Modal/RunPod), ~$20–100 per experiment.

## Pipeline

### 0. Export + download audio (needs real data + service-role key)

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/export-training-data.mjs --language yue-HK --out training-export/
```

Audio is referenced by `audio_url` — a path inside the private `recordings`
storage bucket (`<user_id>/<sample_id>.wav`). Mirror the bucket locally with
the same relative layout (e.g. Supabase CLI `supabase storage cp -r` or a small
script hitting the storage API with the service key) into `training-export/audio/`.

> **Follow-up needed in `scripts/export-training-data.mjs`**: it does not yet
> join the `sample_reviews` table (migration 0005), so reviewer verdicts are
> absent from exports. `prepare_data.py` already understands optional
> `review_verdict` / `review_corrected_text` fields and will use them the day
> the export adds those columns; until then it filters on what exists
> (user corrections + high-score exam samples).

### 1. Build manifests — **testable now against the fixture**

```bash
python ml/train/whisper-lora/prepare_data.py \
  --in ml/train/whisper-lora/fixtures/sample.jsonl \
  --out ml/train/whisper-lora/data --val-speaker-pct 25
```

Expected fixture result: `read 9 rows -> kept 5 (2 train / 3 val)`, exercising
every filter branch (no-audio drop, low-score drop, review verified/corrected/
rejected, user correction). Real run: add `--audio-dir training-export/audio`
so manifest `audio` paths become absolute local files (train.py requires this).

Manifest shape (HF-ready; `load_dataset("json", ...)` + `cast_column("audio", Audio(16000))`):
`{"audio", "text", "speaker", "language", "source", "score", "stt_model", "audio_url"}`.
Splits are **by speaker hash** to prevent leakage.

### 2. Train — *untested until data*

```bash
pip install -r ml/train/whisper-lora/requirements.txt
python ml/train/whisper-lora/train.py --config ml/train/whisper-lora/config.yaml --dry-run
python ml/train/whisper-lora/train.py --config ml/train/whisper-lora/config.yaml
```

`--dry-run` builds config → datasets → processor → LoRA model → trainer and
exits before training (set `base_model: openai/whisper-tiny` temporarily for a
cheap laptop check). Consider pre-mixing public native corpora (Common Voice
`yue`, MDCC) before adapting on learner audio — see docs/ML_TRAINING_PLAN.md.

### 3. Eval gate — feed the EXISTING harness (do not reimplement CER)

`ml/eval/evaluate_stt.mjs` is the single source of truth. It reads
speech_samples-shaped JSONL and scores `transcript` against
`corrected || expected` with dialect-aware normalization.
`transcribe_for_eval.py` produces exactly that: it runs a model over
`val.jsonl` and writes rows with `transcript` = the model's hypothesis and
`corrected` = the manifest's trusted reference.

```bash
# baseline (no adapter) and fine-tune, same held-out split:
python ml/train/whisper-lora/transcribe_for_eval.py --manifest ml/train/whisper-lora/data/val.jsonl \
  --tag whisper-large-v3-baseline --out ml/train/whisper-lora/data/val_baseline.jsonl
python ml/train/whisper-lora/transcribe_for_eval.py --manifest ml/train/whisper-lora/data/val.jsonl \
  --adapter ml/train/whisper-lora/checkpoints/adapter \
  --tag whisper-lora-v1 --out ml/train/whisper-lora/data/val_finetune.jsonl

node ml/eval/evaluate_stt.mjs --in ml/train/whisper-lora/data/val_baseline.jsonl
node ml/eval/evaluate_stt.mjs --in ml/train/whisper-lora/data/val_finetune.jsonl
```

Also benchmark the **production baseline** (gpt-4o-transcribe): the raw export
already contains its transcripts, so
`node ml/eval/evaluate_stt.mjs --in training-export/speech_samples.jsonl`
scores it directly. **Ship bar: ≥ 15–20 % relative mean-CER reduction vs that
baseline on held-out speakers.**

### 4. Serve + env flip

See [serve/README.md](serve/README.md) — FastAPI server implementing the
`api/_lib/transcribeCore.js` contract, Docker/Modal/RunPod notes, and the
`STT_BASE_URL_YUE_HK` rollout/rollback procedure.

## Files

| File | Tested? |
|---|---|
| `prepare_data.py`, `fixtures/sample.jsonl` | **Yes — runs today** (command above) |
| `train.py`, `config.yaml`, `requirements.txt` | Reviewed only — untested until data |
| `transcribe_for_eval.py` | Reviewed only — untested until data |
| `serve/*` | Reviewed only — untested until a model exists |
