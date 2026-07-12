# STT serving — fine-tuned Whisper behind the `/api/transcribe` contract

> **STATUS: UNTESTED UNTIL DATA.** No fine-tuned model exists yet (the database
> has zero consented samples), so this server has never been run against a real
> model. The request/response contract was read directly from
> `api/_lib/transcribeCore.js` and must be kept in sync with it.

## The contract (from `api/_lib/transcribeCore.js`)

When `STT_BASE_URL_YUE_HK` (or global `STT_BASE_URL`) is set, the app's
serverless function forwards transcription requests as:

| | |
|---|---|
| Method / path | `POST` to the **full URL in the env var** — include the path, e.g. `https://host/transcribe` |
| Headers | `Content-Type: application/json`; `Authorization: Bearer <STT_API_KEY>` **only when** `STT_API_KEY` is set on Vercel |
| Body | `{"audio": "<base64 16 kHz mono WAV>", "language": "zh" \| null, "prompt": "<string>" \| null}` |
| Expected reply | `200` with `{"text": "<transcript>"}` |
| Timeout | **20 s** (`UPSTREAM_TIMEOUT_MS`) — a cold start slower than this surfaces as a 504 to users |
| Failure mapping | any non-200 → the app returns a generic 502 |

Quirk: for the yue-HK pack the forwarded `language` hint is `"zh"` (the
manifest maps `yue-HK → sttLanguages ["zh"]`). This server ignores the hint —
it *is* the Cantonese model — and always transcribes with `STT_LANGUAGE`
(default `yue`).

## Preparing the model artifact

`train.py` produces a LoRA adapter. faster-whisper needs a merged CTranslate2
model:

```bash
pip install ctranslate2 transformers peft
python - <<'EOF'
from peft import PeftModel
from transformers import WhisperForConditionalGeneration
base = WhisperForConditionalGeneration.from_pretrained("openai/whisper-large-v3")
merged = PeftModel.from_pretrained(base, "ml/train/whisper-lora/checkpoints/adapter").merge_and_unload()
merged.save_pretrained("merged-model")
EOF
ct2-transformers-converter --model merged-model --output_dir ct2-model --quantization float16
```

## Running locally (CPU smoke test)

```bash
pip install -r requirements.txt
MODEL_DIR=./ct2-model DEVICE=cpu STT_API_KEY=dev-secret uvicorn server:app --port 8000
curl -X POST http://localhost:8000/transcribe \
  -H "Authorization: Bearer dev-secret" -H "Content-Type: application/json" \
  -d "{\"audio\": \"$(base64 -w0 sample.wav)\", \"language\": \"zh\", \"prompt\": null}"
```

## Deployment notes

**Modal** (recommended in docs/ML_TRAINING_PLAN.md): wrap `server.py`'s logic in
a Modal `@app.function(gpu="T4")` + `@modal.asgi_app()`, bake `ct2-model` into
the image or a `modal.Volume`, and set `STT_API_KEY` as a Modal secret.
Serverless GPU ≈ $30–80/mo at this app's traffic. **Watch the 20 s budget**:
configure `keep_warm=1` (or a scheduled ping) so cold starts don't blow the
timeout.

**RunPod / any Docker host**: build this `Dockerfile` (swap the base image for
`nvidia/cuda:12.2.2-cudnn8-runtime-ubuntu22.04` + Python 3.11 for GPU), mount
the CT2 model at `/model`, expose port 8000. An always-on pod avoids cold
starts entirely at ~$0.2–0.4/hr for a T4/A10.

## The env flip (rollout & rollback)

On a **preview deployment first**, set in Vercel:

```
STT_BASE_URL_YUE_HK=https://<your-endpoint>/transcribe
STT_API_KEY=<the same secret the server was started with>
```

- Per-language: only yue-HK transcription is routed; English (`en`) STT for the
  learner's side still goes to OpenAI. Global `STT_BASE_URL` would route
  everything — don't use it for a Cantonese-only model.
- Verify with live use + the eval harness before flipping production.
- **Rollback = unset the env var.** The OpenAI path is the always-working
  default; no client changes ever.
