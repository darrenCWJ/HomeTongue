"""Build DPO preference pairs from the consented corrections export (plan step 3).

Input: corrections.jsonl from scripts/export-training-data.mjs —
{"speaker", "language", "kind", "original", "corrected", "rating", "context",
"created_at"}.

Pair sources:
  1. suggestion_rating rows: within each shared non-empty `context`, every
     thumbs-up suggestion is paired against every thumbs-down suggestion
     (capped by --max-pairs-per-context). prompt = context.

     KNOWN LIMITATION / FOLLOW-UP: the app currently records suggestion
     ratings with context = null (src/features/chat/ChatPage.tsx — the
     recordCorrection call passes no `context`), so NO rating pairs can form
     from today's data. Follow-up: pass the preceding conversation turn as
     `context` when recording ratings. Until then, context-less ratings are
     counted and reported as unpairable (KTO-style single-signal training is
     the alternative if pairs stay scarce — see README).

  2. transcript_edit rows (unless --no-edits): the user's corrected transcript
     is preferred over the raw STT output for a "fix this transcript" prompt.

Output: <out>/dpo.jsonl — {"prompt", "chosen", "rejected", "source"} per line
(the column names TRL's DPOTrainer expects).

Testable NOW against the checked-in fixture:

  python ml/train/slm-dialogue/prepare_dpo_data.py \
    --corrections ml/train/slm-dialogue/fixtures/corrections.jsonl \
    --out ml/train/slm-dialogue/data
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

DEFAULT_MAX_PAIRS_PER_CONTEXT = 4
EDIT_PROMPT_TEMPLATE = (
    "Fix this Cantonese speech-to-text transcript into what the speaker actually said, "
    "in natural colloquial Hong Kong Cantonese: {original}"
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--corrections", required=True, help="corrections.jsonl from the export")
    parser.add_argument("--out", dest="out_dir", required=True, help="output directory for dpo.jsonl")
    parser.add_argument(
        "--max-pairs-per-context",
        type=int,
        default=DEFAULT_MAX_PAIRS_PER_CONTEXT,
        help=f"cap on up x down cross-pairs per shared context (default {DEFAULT_MAX_PAIRS_PER_CONTEXT})",
    )
    parser.add_argument("--no-edits", action="store_true", help="exclude transcript_edit pairs")
    return parser.parse_args(argv)


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        sys.exit(f"Corrections file not found: {path}\nRun scripts/export-training-data.mjs first.")
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


def rating_pairs(rows: list[dict[str, Any]], max_per_context: int) -> tuple[list[dict[str, str]], int]:
    """Cross thumbs-up against thumbs-down suggestions sharing a context."""
    by_context: dict[str, dict[str, list[str]]] = defaultdict(lambda: {"up": [], "down": []})
    unpairable_no_context = 0
    for row in rows:
        if row.get("kind") != "suggestion_rating" or row.get("rating") not in ("up", "down"):
            continue
        original = (row.get("original") or "").strip()
        context = (row.get("context") or "").strip()
        if not original:
            continue
        if not context:
            unpairable_no_context += 1
            continue
        by_context[context][row["rating"]].append(original)

    pairs: list[dict[str, str]] = []
    for context, buckets in by_context.items():
        count = 0
        for chosen in buckets["up"]:
            for rejected in buckets["down"]:
                if chosen == rejected or count >= max_per_context:
                    continue
                pairs.append(
                    {"prompt": context, "chosen": chosen, "rejected": rejected, "source": "suggestion_rating"}
                )
                count += 1
    return pairs, unpairable_no_context


def edit_pairs(rows: list[dict[str, Any]]) -> list[dict[str, str]]:
    """The user's fixed transcript is preferred over the raw STT output."""
    pairs: list[dict[str, str]] = []
    for row in rows:
        if row.get("kind") != "transcript_edit":
            continue
        original = (row.get("original") or "").strip()
        corrected = (row.get("corrected") or "").strip()
        if not original or not corrected or original == corrected:
            continue
        pairs.append(
            {
                "prompt": EDIT_PROMPT_TEMPLATE.format(original=original),
                "chosen": corrected,
                "rejected": original,
                "source": "transcript_edit",
            }
        )
    return pairs


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    rows = load_jsonl(Path(args.corrections))

    pairs, unpairable = rating_pairs(rows, args.max_pairs_per_context)
    print(f"suggestion ratings: {len(pairs)} pairs; {unpairable} unpairable (context is null)")
    if unpairable:
        print(
            "  NOTE: the app records ratings without context today (ChatPage.tsx) - "
            "see the follow-up in this script's docstring."
        )
    if not args.no_edits:
        edits = edit_pairs(rows)
        pairs.extend(edits)
        print(f"transcript edits: {len(edits)} pairs")

    if not pairs:
        sys.exit(
            "No DPO pairs produced. This is EXPECTED while the corpus is empty (and while "
            "suggestion ratings are recorded without context — see docstring)."
        )

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "dpo.jsonl"
    with out_path.open("w", encoding="utf-8") as handle:
        for pair in pairs:
            handle.write(json.dumps(pair, ensure_ascii=False) + "\n")
    print(f"wrote {len(pairs)} pairs to {out_path}")


if __name__ == "__main__":
    main()
