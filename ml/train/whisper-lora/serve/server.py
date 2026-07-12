"""Minimal STT server implementing the contract api/_lib/transcribeCore.js expects.

STATUS: UNTESTED UNTIL DATA — there is no fine-tuned model to load yet. The
contract below was read directly from api/_lib/transcribeCore.js; keep them in
sync if that file changes.

Contract (what transcribeCore sends when STT_BASE_URL(_YUE_HK) is set):
  POST <STT_BASE_URL>            (the env var carries the FULL url incl. path)
  Content-Type: application/json
  Authorization: Bearer <STT_API_KEY>      (only when STT_API_KEY is set)
  Body: {"audio": "<base64 16kHz mono WAV>", "language": "zh" | null, "prompt": "<str>" | null}

  Expected reply: 200 {"text": "<transcript>"} within 20 s (UPSTREAM_TIMEOUT_MS);
  any non-200 makes the app return a generic 502 to the client.

Notes:
  - The incoming `language` hint for the yue-HK pack is "zh" (the manifest maps
    yue-HK -> sttLanguages ["zh"]). This server IS the Cantonese fine-tune, so
    the hint is ignored and STT_LANGUAGE (default "yue") is always used.
  - Auth: set STT_API_KEY here to the same value configured on Vercel; when set,
    requests without the matching bearer token get 401.

Env:
  MODEL_DIR     required — CTranslate2 model dir (merged LoRA converted via
                ct2-transformers-converter; see serve/README.md)
  STT_API_KEY   optional — shared bearer secret
  STT_LANGUAGE  optional — whisper language token (default "yue")
  DEVICE        optional — "cuda" (default) or "cpu"

Run: uvicorn server:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import base64
import binascii
import io
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator, Optional

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

MODEL: object | None = None
STT_LANGUAGE = os.environ.get("STT_LANGUAGE", "yue")


class TranscribeRequest(BaseModel):
    audio: str
    language: Optional[str] = None  # ignored — see module docstring
    prompt: Optional[str] = None


class TranscribeResponse(BaseModel):
    text: str


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Load the model once at startup; fail fast when MODEL_DIR is missing."""
    global MODEL
    model_dir = os.environ.get("MODEL_DIR")
    if not model_dir:
        raise RuntimeError("MODEL_DIR env var is required (path to the CTranslate2 model dir).")
    if not os.path.isdir(model_dir):
        raise RuntimeError(f"MODEL_DIR does not exist: {model_dir}")
    from faster_whisper import WhisperModel

    device = os.environ.get("DEVICE", "cuda")
    compute_type = "float16" if device == "cuda" else "int8"
    MODEL = WhisperModel(model_dir, device=device, compute_type=compute_type)
    yield


app = FastAPI(title="hometongue-stt", lifespan=lifespan)


def check_auth(authorization: str | None) -> None:
    expected = os.environ.get("STT_API_KEY")
    if not expected:
        return  # auth disabled — do not expose such a deployment publicly
    if authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="Invalid or missing bearer token")


@app.get("/healthz")
def healthz() -> dict[str, bool]:
    return {"ok": MODEL is not None}


@app.post("/transcribe", response_model=TranscribeResponse)
def transcribe(
    body: TranscribeRequest,
    authorization: Optional[str] = Header(default=None),
) -> TranscribeResponse:
    check_auth(authorization)
    if MODEL is None:  # lifespan guarantees this; defensive for test harnesses
        raise HTTPException(status_code=503, detail="Model not loaded")
    try:
        wav_bytes = base64.b64decode(body.audio, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="audio must be valid base64")
    if not wav_bytes:
        raise HTTPException(status_code=400, detail="audio is empty")

    segments, _info = MODEL.transcribe(  # type: ignore[attr-defined]
        io.BytesIO(wav_bytes),
        language=STT_LANGUAGE,
        initial_prompt=body.prompt or None,
        beam_size=5,
        vad_filter=False,  # exam clips are short; VAD can eat whole utterances
    )
    text = "".join(segment.text for segment in segments).strip()
    return TranscribeResponse(text=text)
