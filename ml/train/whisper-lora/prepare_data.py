"""Build HuggingFace-ready train/val manifests from the anonymized speech export.

Input: the ``speech_samples.jsonl`` produced by ``scripts/export-training-data.mjs``
(record shape: speaker, language, source, expected, transcript, corrected, score,
stt_model, audio_url, created_at) plus, for a real run, a local mirror of the
private ``recordings`` storage bucket (``--audio-dir``).

Reference-text policy (what the audio is assumed to actually contain), in order:
  1. review_verdict == "rejected"                    -> drop
  2. review_verdict == "corrected" + review text     -> reviewer's transcription
  3. corrected (the user's own transcript edit)      -> human truth
  4. review_verdict == "verified" + expected          -> verified exam target
  5. exam sample with score >= --min-exam-score       -> expected (proxy-verified:
     a high LLM score means the transcript matched the target, so the audio
     very likely contains the expected phrase)
  6. otherwise                                        -> drop (untrusted label)

NOTE: ``scripts/export-training-data.mjs`` joins the ``sample_reviews`` table
(migration 0005), populating ``review_verdict`` / ``review_corrected_text`` on
each record (null when unreviewed). Review-rejected samples are already
excluded from the export by default, so rule 1 only fires on exports produced
with ``--include-rejected``.

Splits are made BY SPEAKER HASH (never by row) so no speaker leaks across
train/val. This script only builds manifests — it never decodes audio — so it
is runnable today against the checked-in fixture:

  python ml/train/whisper-lora/prepare_data.py \
    --in ml/train/whisper-lora/fixtures/sample.jsonl \
    --out ml/train/whisper-lora/data --val-speaker-pct 25
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

DEFAULT_MIN_EXAM_SCORE = 80
DEFAULT_VAL_SPEAKER_PCT = 10
SPEAKER_HASH_BUCKETS = 100


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--in", dest="input", required=True, help="speech_samples.jsonl from the export")
    parser.add_argument("--out", dest="out_dir", required=True, help="output directory for train.jsonl / val.jsonl")
    parser.add_argument(
        "--audio-dir",
        default=None,
        help="local mirror of the recordings bucket; audio_url is resolved against it. "
        "Omit for a manifest-only dry pass (paths stay bucket-relative).",
    )
    parser.add_argument("--language", default=None, help="keep only rows with this language code (e.g. yue-HK)")
    parser.add_argument(
        "--min-exam-score",
        type=int,
        default=DEFAULT_MIN_EXAM_SCORE,
        help=f"minimum exam score to trust `expected` as the audio label (default {DEFAULT_MIN_EXAM_SCORE})",
    )
    parser.add_argument(
        "--val-speaker-pct",
        type=int,
        default=DEFAULT_VAL_SPEAKER_PCT,
        help=f"percent of speaker-hash space held out for validation (default {DEFAULT_VAL_SPEAKER_PCT})",
    )
    return parser.parse_args(argv)


def load_rows(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        sys.exit(f"Input not found: {path}\nRun scripts/export-training-data.mjs first (see README).")
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as err:
                sys.exit(f"{path}:{line_no}: invalid JSON ({err.msg})")
    if not rows:
        sys.exit(f"{path} contains no records — the corpus is empty. Collect consented samples first.")
    return rows


def resolve_reference(row: dict[str, Any], min_exam_score: int) -> tuple[str | None, str]:
    """Return (reference_text, reason). reference_text is None when the row is dropped."""
    verdict = row.get("review_verdict")
    if verdict == "rejected":
        return None, "drop_review_rejected"
    review_fix = row.get("review_corrected_text")
    if verdict == "corrected" and review_fix:
        return review_fix, "kept_review_corrected"
    corrected = row.get("corrected")
    if corrected:
        return corrected, "kept_user_corrected"
    expected = row.get("expected")
    if verdict == "verified" and expected:
        return expected, "kept_review_verified"
    score = row.get("score")
    if (
        row.get("source") == "exam"
        and expected
        and isinstance(score, (int, float))
        and score >= min_exam_score
    ):
        return expected, "kept_high_score_exam"
    return None, "drop_no_trusted_reference"


def is_validation_speaker(speaker: str, val_pct: int) -> bool:
    digest = hashlib.sha256(speaker.encode("utf-8")).hexdigest()
    return int(digest, 16) % SPEAKER_HASH_BUCKETS < val_pct


def build_manifest_row(row: dict[str, Any], reference: str, audio: str) -> dict[str, Any]:
    return {
        "audio": audio,
        "text": reference,
        "speaker": row.get("speaker"),
        "language": row.get("language"),
        "source": row.get("source"),
        "score": row.get("score"),
        "stt_model": row.get("stt_model"),
        "audio_url": row.get("audio_url"),
    }


def write_manifest(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    rows = load_rows(Path(args.input))
    audio_dir = Path(args.audio_dir) if args.audio_dir else None
    if audio_dir and not audio_dir.is_dir():
        sys.exit(f"--audio-dir does not exist: {audio_dir}")

    reasons: Counter[str] = Counter()
    train: list[dict[str, Any]] = []
    val: list[dict[str, Any]] = []

    for row in rows:
        if args.language and row.get("language") != args.language:
            reasons["drop_other_language"] += 1
            continue
        speaker = row.get("speaker")
        if not speaker:
            reasons["drop_missing_speaker"] += 1
            continue
        audio_url = row.get("audio_url")
        if not audio_url:
            reasons["drop_no_audio"] += 1
            continue
        reference, reason = resolve_reference(row, args.min_exam_score)
        reasons[reason] += 1
        if reference is None:
            continue
        if audio_dir:
            local = audio_dir / audio_url
            if not local.is_file():
                reasons["drop_audio_file_missing"] += 1
                reasons[reason] -= 1  # undo the kept_* count: the row is dropped after all
                continue
            audio = str(local.resolve())
        else:
            audio = audio_url  # bucket-relative; fine for a manifest-only pass
        manifest_row = build_manifest_row(row, reference, audio)
        (val if is_validation_speaker(speaker, args.val_speaker_pct) else train).append(manifest_row)

    kept = len(train) + len(val)
    if kept == 0:
        sys.exit(
            "No usable samples after filtering. This is EXPECTED while the database has zero "
            "consented samples — see ml/train/README.md for the collection prerequisites.\n"
            f"Drop reasons: {dict(reasons)}"
        )

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    write_manifest(out_dir / "train.jsonl", train)
    write_manifest(out_dir / "val.jsonl", val)

    train_speakers = {r["speaker"] for r in train}
    val_speakers = {r["speaker"] for r in val}
    print(f"read {len(rows)} rows -> kept {kept} ({len(train)} train / {len(val)} val)")
    print(f"speakers: {len(train_speakers)} train / {len(val_speakers)} val (split by speaker hash)")
    for reason, count in sorted(reasons.items()):
        if count:
            print(f"  {reason}: {count}")
    if not val:
        print("WARNING: validation split is empty — raise --val-speaker-pct or collect more speakers.")
    if not audio_dir:
        print("NOTE: --audio-dir not given; `audio` paths are bucket-relative and NOT verified to exist.")
    print(f"wrote {out_dir / 'train.jsonl'} and {out_dir / 'val.jsonl'}")


if __name__ == "__main__":
    main()
