"""LoRA SFT of the dialogue SLM on the synthetic + corrected corpus (plan step 3).

STATUS: UNTESTED UNTIL DATA — the consented corpus is empty and no full-scale
synthetic corpus has been generated yet. Reviewed scaffold; run --dry-run first
on the GPU box.

Usage:
  pip install -r ml/train/slm-dialogue/requirements.txt
  python ml/train/slm-dialogue/train_sft.py --config ml/train/slm-dialogue/config.yaml --dry-run
  python ml/train/slm-dialogue/train_sft.py --config ml/train/slm-dialogue/config.yaml

--dry-run builds config -> dataset -> tokenizer -> LoRA model -> trainer and
exits before training. Point config `base_model` at a tiny model (e.g.
Qwen/Qwen2.5-0.5B-Instruct) for a cheap plumbing check.

Input data: data/sft.jsonl from prepare_sft_data.py — one {"messages": [...]}
conversation per line (TRL's conversational SFT format).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", required=True, help="path to config.yaml")
    parser.add_argument("--dry-run", action="store_true", help="build plumbing, skip training")
    return parser.parse_args(argv)


def load_config(path: Path) -> dict[str, Any]:
    try:
        import yaml
    except ImportError:
        sys.exit("Missing dependency: pyyaml. Install with: pip install -r ml/train/slm-dialogue/requirements.txt")
    if not path.is_file():
        sys.exit(f"Config not found: {path}")
    with path.open(encoding="utf-8") as handle:
        config = yaml.safe_load(handle)
    for key in ("base_model", "lora", "sft"):
        if key not in config:
            sys.exit(f"Config missing required key: {key}")
    return config


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    config = load_config(Path(args.config))
    try:
        from datasets import load_dataset
        from peft import LoraConfig
        from transformers import AutoModelForCausalLM, AutoTokenizer
        from trl import SFTConfig, SFTTrainer
    except ImportError as err:
        sys.exit(
            f"Missing training dependency: {err.name}. "
            "Install with: pip install -r ml/train/slm-dialogue/requirements.txt"
        )

    sft_cfg = config["sft"]
    data_path = Path(sft_cfg["data"])
    if not data_path.is_file():
        sys.exit(f"SFT data not found: {data_path}\nBuild it first with prepare_sft_data.py (see README).")

    dataset = load_dataset("json", data_files=str(data_path))["train"]
    if "meta" in dataset.column_names:
        dataset = dataset.remove_columns(["meta"])  # keep only `messages` for the trainer
    print(f"SFT examples: {len(dataset)}")

    tokenizer = AutoTokenizer.from_pretrained(config["base_model"])
    model = AutoModelForCausalLM.from_pretrained(config["base_model"], torch_dtype="auto")

    lora_cfg = config["lora"]
    peft_config = LoraConfig(
        r=int(lora_cfg["r"]),
        lora_alpha=int(lora_cfg["alpha"]),
        lora_dropout=float(lora_cfg["dropout"]),
        target_modules=list(lora_cfg["target_modules"]),
        task_type="CAUSAL_LM",
    )
    training_args = SFTConfig(
        output_dir=sft_cfg["output_dir"],
        max_seq_length=int(sft_cfg["max_seq_length"]),
        per_device_train_batch_size=int(sft_cfg["per_device_train_batch_size"]),
        gradient_accumulation_steps=int(sft_cfg["gradient_accumulation_steps"]),
        learning_rate=float(sft_cfg["learning_rate"]),
        num_train_epochs=float(sft_cfg["num_train_epochs"]),
        warmup_ratio=float(sft_cfg["warmup_ratio"]),
        logging_steps=int(sft_cfg["logging_steps"]),
        save_steps=int(sft_cfg["save_steps"]),
        seed=int(sft_cfg["seed"]),
        report_to="none",
    )
    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=dataset,
        processing_class=tokenizer,
        peft_config=peft_config,
    )

    if args.dry_run:
        print("--dry-run: plumbing built successfully; skipping training.")
        return

    trainer.train()
    adapter_dir = Path(sft_cfg["output_dir"]) / "adapter"
    trainer.save_model(str(adapter_dir))
    print(f"SFT LoRA adapter saved to {adapter_dir}")
    print("Next: train_dpo.py on the ratings pairs, then eval (see README).")


if __name__ == "__main__":
    main()
