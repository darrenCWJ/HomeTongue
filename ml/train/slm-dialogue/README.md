# Step 3 — Colloquial dialogue SLM (SFT + DPO)

> **STATUS: THE DATABASE HAS ZERO SAMPLES.** No consented corrections or
> ratings exist yet, and no full-scale synthetic corpus has been generated.
> What IS tested today: `prepare_sft_data.py` and `prepare_dpo_data.py` against
> the checked-in fixtures (commands below). `train_sft.py` / `train_dpo.py` are
> reviewed scaffolds, **untested until data**.

Trigger (docs/ML_TRAINING_PLAN.md): ~3–5k ratings/corrections plus the
synthetic corpus. Honest framing from the plan: below ~50k quality examples a
fine-tuned small model rarely beats frontier-plus-good-prompting — the shipped
retrieval few-shot layer comes first; **the thumbs up/down ratings are the real
asset** (preference data).

## Data prep — **testable now against the fixtures**

```bash
# SFT corpus: synthetic dialogues (ml/data generator output) + transcript edits
python ml/train/slm-dialogue/prepare_sft_data.py \
  --dialogues ml/train/slm-dialogue/fixtures/dialogues.jsonl \
  --corrections ml/train/slm-dialogue/fixtures/corrections.jsonl \
  --out ml/train/slm-dialogue/data

# DPO pairs: suggestion ratings (paired by shared context) + transcript edits
python ml/train/slm-dialogue/prepare_dpo_data.py \
  --corrections ml/train/slm-dialogue/fixtures/corrections.jsonl \
  --out ml/train/slm-dialogue/data
```

Expected fixture results: SFT `3 examples` (2 dialogues + 1 edit; the
null-corrected edit is skipped), DPO `2 pairs` (1 rating pair + 1 edit pair;
the context-less rating is reported unpairable).

Real inputs:
- `--dialogues`: `OPENAI_API_KEY=... node ml/data/generate-synthetic-dialogues.mjs --count 500`
  → `ml/data/out/dialogues.jsonl` (colloquialness-filtered).
- `--corrections`: `node scripts/export-training-data.mjs --language yue-HK --out training-export/`
  → `training-export/corrections.jsonl`.

> **Follow-up needed for real DPO pairs**: the app currently records
> suggestion ratings with `context = null`
> (`src/features/chat/ChatPage.tsx`, the `recordCorrection` call), so up/down
> ratings can never be paired against the same prompt. Pass the preceding
> conversation turn as `context` when recording ratings. If pairs stay scarce,
> KTO (single-signal preference tuning, also in TRL) works on unpaired thumbs.

## Training — *untested until data*

```bash
pip install -r ml/train/slm-dialogue/requirements.txt
python ml/train/slm-dialogue/train_sft.py --config ml/train/slm-dialogue/config.yaml --dry-run
python ml/train/slm-dialogue/train_sft.py --config ml/train/slm-dialogue/config.yaml
python ml/train/slm-dialogue/train_dpo.py --config ml/train/slm-dialogue/config.yaml --dry-run
python ml/train/slm-dialogue/train_dpo.py --config ml/train/slm-dialogue/config.yaml
```

Base model: Qwen-class instruct (config `base_model`); consider a community
Cantonese LLM if it evals better. DPO starts from the merged SFT adapter
(config `dpo.sft_adapter`). One A100-class run, ~$50–300
(docs/ML_TRAINING_PLAN.md). For a cheap `--dry-run`, temporarily set
`base_model: Qwen/Qwen2.5-0.5B-Instruct`.

## Evaluation

Per the plan: frontier-judge side-by-side on held-out prompts, then a live A/B
behind the env flag with real thumbs as the metric. (There is no offline
harness for dialogue quality — unlike STT, where `ml/eval/evaluate_stt.mjs` is
the gate.)

## Serving + env flip

`api/_lib/chatCore.js` speaks the OpenAI chat-completions protocol to
`${LLM_BASE_URL}/chat/completions`. Serve the merged model with vLLM's
OpenAI-compatible server:

```bash
# merge: base + SFT adapter (+ DPO adapter), save to ./merged-slm, then:
vllm serve ./merged-slm --served-model-name <NAME> --api-key <SECRET> --port 8000
```

Then on a **preview deployment first**:

```
LLM_BASE_URL_YUE_HK=https://<host>/v1     # per-language flip; chatCore appends /chat/completions
LLM_API_KEY=<SECRET>                      # sent as the bearer token
OPENAI_MODEL=<NAME>                       # IMPORTANT — see below
```

Two contract quirks read from `api/_lib/chatCore.js`:
1. The model name sent upstream is the **global** `OPENAI_MODEL` (default
   `gpt-4o-mini`) — there is no per-language model name. Either start vLLM with
   `--served-model-name` matching whatever `OPENAI_MODEL` is set to, or accept
   that flipping `OPENAI_MODEL` affects the OpenAI-routed languages too.
2. Auth precedence is `LLM_API_KEY ?? OPENAI_API_KEY` — set `LLM_API_KEY` so
   the real OpenAI key is never sent to your endpoint.

Rollback = unset `LLM_BASE_URL_YUE_HK`. The OpenAI path is the default; the
client never changes.

## Files

| File | Tested? |
|---|---|
| `prepare_sft_data.py`, `prepare_dpo_data.py`, `fixtures/*` | **Yes — run today** (commands above) |
| `train_sft.py`, `train_dpo.py`, `config.yaml`, `requirements.txt` | Reviewed only — untested until data |
