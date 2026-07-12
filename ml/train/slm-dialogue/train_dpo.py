"""DPO preference tuning on collected suggestion ratings (plan step 3, phase 2).

STATUS: UNTESTED UNTIL DATA — zero ratings exist, and rating pairs additionally
require the context-capture follow-up (see prepare_dpo_data.py docstring).
Reviewed scaffold; run --dry-run first on the GPU box.

Usage:
  python ml/train/slm-dialogue/train_dpo.py --config ml/train/slm-dialogue/config.yaml --dry-run
  python ml/train/slm-dialogue/train_dpo.py --config ml/train/slm-dialogue/config.yaml

Starts from the SFT result when config `dpo.sft_adapter` points at an adapter
dir (it is merged into the base first); set it to "" to DPO the raw base model.

Input data: data/dpo.jsonl from prepare_dpo_data.py — {"prompt", "chosen",
"rejected", "source"} per line (TRL DPOTrainer column names).
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
    for key in ("base_model", "lora", "dpo"):
        if key not in config:
            sys.exit(f"Config missing required key: {key}")
    return config


def load_base_model(config: dict[str, Any]) -> Any:
    """Load the base model, merging the SFT adapter into it when configured."""
    from transformers import AutoModelForCausalLM

    model = AutoModelForCausalLM.from_pretrained(config["base_model"], torch_dtype="auto")
    sft_adapter = str(config["dpo"].get("sft_adapter") or "").strip()
    if not sft_adapter:
        print("dpo.sft_adapter is empty — running DPO on the raw base model.")
        return model
    if not Path(sft_adapter).is_dir():
        sys.exit(
            f"dpo.sft_adapter not found: {sft_adapter}\n"
            "Run train_sft.py first, or set dpo.sft_adapter to \"\" to skip."
        )
    from peft import PeftModel

    print(f"merging SFT adapter from {sft_adapter} into the base model")
    return PeftModel.from_pretrained(model, sft_adapter).merge_and_unload()


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    config = load_config(Path(args.config))
    try:
        from datasets import load_dataset
        from peft import LoraConfig
        from transformers import AutoTokenizer
        from trl import DPOConfig, DPOTrainer
    except ImportError as err:
        sys.exit(
            f"Missing training dependency: {err.name}. "
            "Install with: pip install -r ml/train/slm-dialogue/requirements.txt"
        )

    dpo_cfg = config["dpo"]
    data_path = Path(dpo_cfg["data"])
    if not data_path.is_file():
        sys.exit(f"DPO data not found: {data_path}\nBuild it first with prepare_dpo_data.py (see README).")

    dataset = load_dataset("json", data_files=str(data_path))["train"]
    if "source" in dataset.column_names:
        dataset = dataset.remove_columns(["source"])  # keep prompt/chosen/rejected
    print(f"DPO pairs: {len(dataset)}")

    tokenizer = AutoTokenizer.from_pretrained(config["base_model"])
    model = load_base_model(config)

    lora_cfg = config["lora"]
    peft_config = LoraConfig(
        r=int(lora_cfg["r"]),
        lora_alpha=int(lora_cfg["alpha"]),
        lora_dropout=float(lora_cfg["dropout"]),
        target_modules=list(lora_cfg["target_modules"]),
        task_type="CAUSAL_LM",
    )
    training_args = DPOConfig(
        output_dir=dpo_cfg["output_dir"],
        beta=float(dpo_cfg["beta"]),
        max_length=int(dpo_cfg["max_length"]),
        max_prompt_length=int(dpo_cfg["max_prompt_length"]),
        per_device_train_batch_size=int(dpo_cfg["per_device_train_batch_size"]),
        gradient_accumulation_steps=int(dpo_cfg["gradient_accumulation_steps"]),
        learning_rate=float(dpo_cfg["learning_rate"]),
        num_train_epochs=float(dpo_cfg["num_train_epochs"]),
        logging_steps=int(dpo_cfg["logging_steps"]),
        save_steps=int(dpo_cfg["save_steps"]),
        seed=int(dpo_cfg["seed"]),
        report_to="none",
    )
    # ref_model=None + peft_config: TRL uses the frozen base as the implicit
    # reference model, so only one full copy of the weights is resident.
    trainer = DPOTrainer(
        model=model,
        ref_model=None,
        args=training_args,
        train_dataset=dataset,
        processing_class=tokenizer,
        peft_config=peft_config,
    )

    if args.dry_run:
        print("--dry-run: plumbing built successfully; skipping training.")
        return

    trainer.train()
    adapter_dir = Path(dpo_cfg["output_dir"]) / "adapter"
    trainer.save_model(str(adapter_dir))
    print(f"DPO LoRA adapter saved to {adapter_dir}")
    print("Next: merge + serve with vLLM behind LLM_BASE_URL_YUE_HK (see README).")


if __name__ == "__main__":
    main()
