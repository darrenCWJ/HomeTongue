"""Build the SFT corpus for the colloquial-dialogue SLM (plan step 3).

Sources (both optional, at least one required):
  --dialogues    output of ml/data/generate-synthetic-dialogues.mjs —
                 {"topic", "register", "turns": [{"speaker": "A"|"B",
                 "cantonese", "jyutping", "english"}]} per line. Speaker A is
                 the learner, B the native speaker; the model is trained to
                 play B.
  --corrections  corrections.jsonl from scripts/export-training-data.mjs —
                 {"speaker", "language", "kind", "original", "corrected",
                 "rating", "context", "created_at"}. Only kind=transcript_edit
                 rows with a non-empty correction are used, as "fix this STT
                 transcript into natural colloquial Cantonese" examples.
                 (suggestion_rating rows are preference data — see
                 prepare_dpo_data.py.)

Output: <out>/sft.jsonl — {"messages": [{role, content}...], "meta": {...}}
per line, the conversational format TRL's SFTTrainer (and LLaMA-Factory's
openai/sharegpt loaders) consume directly.

Turn normalization for dialogues: consecutive same-speaker turns are merged,
leading native (B) turns are dropped so conversations start with `user`, and a
trailing learner (A) turn is trimmed so every example ends on `assistant`.

Testable NOW against the checked-in fixtures:

  python ml/train/slm-dialogue/prepare_sft_data.py \
    --dialogues ml/train/slm-dialogue/fixtures/dialogues.jsonl \
    --corrections ml/train/slm-dialogue/fixtures/corrections.jsonl \
    --out ml/train/slm-dialogue/data
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

DIALOGUE_SYSTEM_TEMPLATE = (
    "You are a native Hong Kong Cantonese speaker chatting with a heritage learner. "
    "Reply in natural colloquial spoken Cantonese (Traditional Chinese), never written/Mandarin Chinese. "
    "Topic: {topic}. Register: {register}."
)
CORRECTION_SYSTEM = (
    "You fix Cantonese speech-to-text output. Rewrite the transcript as what the speaker "
    "actually said, in natural colloquial Hong Kong Cantonese (Traditional Chinese)."
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dialogues", default=None, help="dialogues.jsonl from the synthetic generator")
    parser.add_argument("--corrections", default=None, help="corrections.jsonl from the export")
    parser.add_argument("--out", dest="out_dir", required=True, help="output directory for sft.jsonl")
    args = parser.parse_args(argv)
    if not args.dialogues and not args.corrections:
        parser.error("provide --dialogues and/or --corrections")
    return args


def load_jsonl(path: Path, label: str) -> list[dict[str, Any]]:
    if not path.is_file():
        sys.exit(f"{label} file not found: {path}")
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
    return rows


def normalize_turns(turns: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Map A/B turns to user/assistant messages with the invariants documented above."""
    messages: list[dict[str, str]] = []
    for turn in turns:
        speaker = turn.get("speaker")
        text = (turn.get("cantonese") or "").strip()
        if speaker not in ("A", "B") or not text:
            continue
        role = "user" if speaker == "A" else "assistant"
        if messages and messages[-1]["role"] == role:
            messages[-1]["content"] += "\n" + text  # merge consecutive same-speaker turns
        else:
            messages.append({"role": role, "content": text})
    while messages and messages[0]["role"] == "assistant":
        messages.pop(0)  # conversations must start with the learner
    while messages and messages[-1]["role"] == "user":
        messages.pop()  # and end on the native speaker
    return messages


def dialogue_examples(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    examples: list[dict[str, Any]] = []
    skipped = 0
    for row in rows:
        turns = row.get("turns")
        if not isinstance(turns, list):
            skipped += 1
            continue
        messages = normalize_turns(turns)
        if len(messages) < 2:
            skipped += 1
            continue
        system = DIALOGUE_SYSTEM_TEMPLATE.format(
            topic=row.get("topic", "everyday life"), register=row.get("register", "casual")
        )
        examples.append(
            {
                "messages": [{"role": "system", "content": system}, *messages],
                "meta": {"source": "synthetic_dialogue", "topic": row.get("topic"), "register": row.get("register")},
            }
        )
    return examples, skipped


def correction_examples(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    examples: list[dict[str, Any]] = []
    skipped = 0
    for row in rows:
        if row.get("kind") != "transcript_edit":
            continue  # ratings belong to prepare_dpo_data.py
        original = (row.get("original") or "").strip()
        corrected = (row.get("corrected") or "").strip()
        if not original or not corrected or original == corrected:
            skipped += 1
            continue
        examples.append(
            {
                "messages": [
                    {"role": "system", "content": CORRECTION_SYSTEM},
                    {"role": "user", "content": original},
                    {"role": "assistant", "content": corrected},
                ],
                "meta": {"source": "transcript_edit", "language": row.get("language")},
            }
        )
    return examples, skipped


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    examples: list[dict[str, Any]] = []

    if args.dialogues:
        rows = load_jsonl(Path(args.dialogues), "--dialogues")
        built, skipped = dialogue_examples(rows)
        examples.extend(built)
        print(f"dialogues: {len(built)} examples from {len(rows)} rows ({skipped} skipped)")
    if args.corrections:
        rows = load_jsonl(Path(args.corrections), "--corrections")
        built, skipped = correction_examples(rows)
        examples.extend(built)
        edits = sum(1 for r in rows if r.get("kind") == "transcript_edit")
        print(f"corrections: {len(built)} examples from {edits} transcript_edit rows ({skipped} skipped)")

    if not examples:
        sys.exit(
            "No SFT examples produced. This is EXPECTED while the corpus is empty — "
            "generate synthetic dialogues (ml/data/generate-synthetic-dialogues.mjs) "
            "and/or collect consented corrections first."
        )

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "sft.jsonl"
    with out_path.open("w", encoding="utf-8") as handle:
        for example in examples:
            handle.write(json.dumps(example, ensure_ascii=False) + "\n")
    print(f"wrote {len(examples)} examples to {out_path}")


if __name__ == "__main__":
    main()
