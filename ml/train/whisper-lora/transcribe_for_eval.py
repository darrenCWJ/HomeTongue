"""Run a (fine-tuned) Whisper model over the val manifest, emitting eval-ready JSONL.

STATUS: UNTESTED UNTIL DATA — requires real audio files and a trained adapter.

This is the handoff into the EXISTING benchmark (ml/eval/evaluate_stt.mjs),
which scores rows of the speech_samples.jsonl shape: it computes CER of
`transcript` against `corrected || expected`. We therefore write:

  transcript -> this model's hypothesis
  corrected  -> the manifest's trusted reference text (so the harness uses it)
  expected   -> null   (reference already carried in `corrected`)
  stt_model  -> --tag  (so baseline vs fine-tune reports are distinguishable)

Usage:
  python ml/train/whisper-lora/transcribe_for_eval.py \
    --manifest ml/train/whisper-lora/data/val.jsonl \
    --base-model openai/whisper-large-v3 \
    --adapter ml/train/whisper-lora/checkpoints/adapter \
    --tag whisper-lora-v1 \
    --out ml/train/whisper-lora/data/val_finetune_transcripts.jsonl

  node ml/eval/evaluate_stt.mjs --in ml/train/whisper-lora/data/val_finetune_transcripts.jsonl

Run once WITHOUT --adapter for the base-model baseline on the same split, and
compare the two harness reports (ship bar: >= 15-20 % relative CER reduction).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--manifest", required=True, help="val.jsonl from prepare_data.py (absolute audio paths)")
    parser.add_argument("--base-model", default="openai/whisper-large-v3", help="HF model id or local dir")
    parser.add_argument("--adapter", default=None, help="LoRA adapter dir from train.py (omit for baseline)")
    parser.add_argument("--tag", required=True, help="stt_model tag written to the output rows")
    parser.add_argument("--out", required=True, help="output JSONL consumable by ml/eval/evaluate_stt.mjs")
    parser.add_argument("--language", default="yue", help="Whisper language token (default: yue)")
    return parser.parse_args(argv)


def load_manifest(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        sys.exit(f"Manifest not found: {path} — run prepare_data.py first.")
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not rows:
        sys.exit(f"{path} is empty — nothing to transcribe.")
    return rows


def load_model_and_processor(base_model: str, adapter: str | None, language: str) -> tuple[Any, Any, Any]:
    try:
        import torch
        from transformers import WhisperForConditionalGeneration, WhisperProcessor
    except ImportError as err:
        sys.exit(
            f"Missing dependency: {err.name}. "
            "Install with: pip install -r ml/train/whisper-lora/requirements.txt"
        )
    processor = WhisperProcessor.from_pretrained(base_model, language=language, task="transcribe")
    model = WhisperForConditionalGeneration.from_pretrained(base_model)
    if adapter:
        try:
            from peft import PeftModel
        except ImportError:
            sys.exit("Missing dependency: peft (needed for --adapter).")
        if not Path(adapter).is_dir():
            sys.exit(f"Adapter dir not found: {adapter}")
        model = PeftModel.from_pretrained(model, adapter)
        model = model.merge_and_unload()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device).eval()
    return model, processor, device


def transcribe(model: Any, processor: Any, device: str, audio_path: Path, language: str) -> str:
    import soundfile as sf
    import torch

    waveform, sample_rate = sf.read(str(audio_path), dtype="float32")
    if waveform.ndim > 1:
        waveform = waveform.mean(axis=1)  # downmix, defensive: app audio is already mono
    inputs = processor(waveform, sampling_rate=sample_rate, return_tensors="pt")
    forced_ids = processor.get_decoder_prompt_ids(language=language, task="transcribe")
    with torch.no_grad():
        generated = model.generate(
            inputs.input_features.to(device), forced_decoder_ids=forced_ids, max_new_tokens=128
        )
    return processor.batch_decode(generated, skip_special_tokens=True)[0].strip()


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    rows = load_manifest(Path(args.manifest))
    model, processor, device = load_model_and_processor(args.base_model, args.adapter, args.language)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    with out_path.open("w", encoding="utf-8") as handle:
        for i, row in enumerate(rows, start=1):
            audio_path = Path(row["audio"])
            if not audio_path.is_file():
                print(f"[{i}/{len(rows)}] SKIP missing audio: {audio_path}", file=sys.stderr)
                continue
            hypothesis = transcribe(model, processor, device, audio_path, args.language)
            handle.write(
                json.dumps(
                    {
                        "speaker": row.get("speaker"),
                        "language": row.get("language"),
                        "source": row.get("source"),
                        "expected": None,
                        "transcript": hypothesis,
                        "corrected": row["text"],
                        "score": row.get("score"),
                        "stt_model": args.tag,
                        "audio_url": row.get("audio_url"),
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
            written += 1
            print(f"[{i}/{len(rows)}] {hypothesis}")

    if written == 0:
        sys.exit("No rows transcribed — check the manifest's audio paths.")
    print(f"\nwrote {written} rows to {out_path}")
    print(f"Score them: node ml/eval/evaluate_stt.mjs --in {out_path}")


if __name__ == "__main__":
    main()
