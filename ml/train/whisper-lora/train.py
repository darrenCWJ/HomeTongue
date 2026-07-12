"""Whisper LoRA fine-tune on the consented learner-audio corpus.

STATUS: UNTESTED UNTIL DATA — the database has zero samples today, so this
script has never been run end-to-end. It is a reviewed scaffold; expect to
shake out minor issues on the first real run (do that with --dry-run first).

Usage (on a rented GPU box, after prepare_data.py has built the manifests
with --audio-dir so `audio` paths are absolute local files):

  pip install -r ml/train/whisper-lora/requirements.txt
  python ml/train/whisper-lora/train.py --config ml/train/whisper-lora/config.yaml --dry-run
  python ml/train/whisper-lora/train.py --config ml/train/whisper-lora/config.yaml

--dry-run builds the full plumbing (config, datasets, processor, LoRA-wrapped
model, trainer) and exits before any training step. It still downloads the
base model — point config `base_model` at openai/whisper-tiny for a cheap check.

Evaluation is NOT done here: use transcribe_for_eval.py + the existing
ml/eval/evaluate_stt.mjs harness (see README.md, "Eval gate").
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", required=True, help="path to config.yaml")
    parser.add_argument("--dry-run", action="store_true", help="build model+data plumbing, skip training")
    parser.add_argument("--resume-from", default=None, help="checkpoint dir to resume from")
    return parser.parse_args(argv)


def load_config(path: Path) -> dict[str, Any]:
    try:
        import yaml
    except ImportError:
        sys.exit("Missing dependency: pyyaml. Install with: pip install -r ml/train/whisper-lora/requirements.txt")
    if not path.is_file():
        sys.exit(f"Config not found: {path}")
    with path.open(encoding="utf-8") as handle:
        config = yaml.safe_load(handle)
    for key in ("base_model", "language", "task", "data", "lora", "training"):
        if key not in config:
            sys.exit(f"Config missing required key: {key}")
    return config


def require_manifest(path_str: str) -> Path:
    path = Path(path_str)
    if not path.is_file():
        sys.exit(
            f"Manifest not found: {path}\n"
            "Build it first: python ml/train/whisper-lora/prepare_data.py "
            "--in <export>/speech_samples.jsonl --audio-dir <bucket-mirror> --out ml/train/whisper-lora/data"
        )
    return path


@dataclass
class SpeechSeq2SeqCollator:
    """Pads log-mel input features and label ids independently (standard HF recipe)."""

    processor: Any

    def __call__(self, features: list[dict[str, Any]]) -> dict[str, Any]:
        input_feats = [{"input_features": f["input_features"]} for f in features]
        batch = self.processor.feature_extractor.pad(input_feats, return_tensors="pt")
        label_feats = [{"input_ids": f["labels"]} for f in features]
        labels_batch = self.processor.tokenizer.pad(label_feats, return_tensors="pt")
        labels = labels_batch["input_ids"].masked_fill(labels_batch.attention_mask.ne(1), -100)
        # The tokenizer prepends the decoder-start token; the model re-adds it.
        if (labels[:, 0] == self.processor.tokenizer.bos_token_id).all().cpu().item():
            labels = labels[:, 1:]
        batch["labels"] = labels
        return batch


def build_datasets(config: dict[str, Any], processor: Any) -> tuple[Any, Any]:
    from datasets import Audio, load_dataset

    data_cfg = config["data"]
    train_path = require_manifest(data_cfg["train_manifest"])
    val_path = require_manifest(data_cfg["val_manifest"])
    raw = load_dataset("json", data_files={"train": str(train_path), "val": str(val_path)})
    sampling_rate = int(data_cfg.get("sampling_rate", 16000))
    raw = raw.cast_column("audio", Audio(sampling_rate=sampling_rate))
    max_label_chars = int(data_cfg.get("max_label_chars", 200))

    def preprocess(example: dict[str, Any]) -> dict[str, Any]:
        audio = example["audio"]
        example["input_features"] = processor(
            audio["array"], sampling_rate=audio["sampling_rate"]
        ).input_features[0]
        example["labels"] = processor.tokenizer(example["text"][:max_label_chars]).input_ids
        return example

    columns = raw["train"].column_names
    processed = raw.map(preprocess, remove_columns=columns)
    return processed["train"], processed["val"]


def build_model(config: dict[str, Any]) -> Any:
    from peft import LoraConfig, get_peft_model
    from transformers import WhisperForConditionalGeneration

    model = WhisperForConditionalGeneration.from_pretrained(config["base_model"])
    model.config.forced_decoder_ids = None
    model.config.suppress_tokens = []
    lora_cfg = config["lora"]
    peft_config = LoraConfig(
        r=int(lora_cfg["r"]),
        lora_alpha=int(lora_cfg["alpha"]),
        lora_dropout=float(lora_cfg["dropout"]),
        target_modules=list(lora_cfg["target_modules"]),
    )
    return get_peft_model(model, peft_config)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    config = load_config(Path(args.config))
    try:
        from transformers import Seq2SeqTrainer, Seq2SeqTrainingArguments, WhisperProcessor
    except ImportError as err:
        sys.exit(
            f"Missing training dependency: {err.name}. "
            "Install with: pip install -r ml/train/whisper-lora/requirements.txt"
        )

    processor = WhisperProcessor.from_pretrained(
        config["base_model"], language=config["language"], task=config["task"]
    )
    train_ds, val_ds = build_datasets(config, processor)
    model = build_model(config)
    model.print_trainable_parameters()

    train_cfg = config["training"]
    training_args = Seq2SeqTrainingArguments(
        output_dir=train_cfg["output_dir"],
        per_device_train_batch_size=int(train_cfg["per_device_train_batch_size"]),
        per_device_eval_batch_size=int(train_cfg["per_device_eval_batch_size"]),
        gradient_accumulation_steps=int(train_cfg["gradient_accumulation_steps"]),
        learning_rate=float(train_cfg["learning_rate"]),
        num_train_epochs=float(train_cfg["num_train_epochs"]),
        warmup_ratio=float(train_cfg["warmup_ratio"]),
        fp16=bool(train_cfg["fp16"]),
        eval_strategy="steps",
        eval_steps=int(train_cfg["eval_steps"]),
        save_steps=int(train_cfg["save_steps"]),
        logging_steps=int(train_cfg["logging_steps"]),
        seed=int(train_cfg["seed"]),
        remove_unused_columns=False,  # required: PEFT forward signature hides columns
        label_names=["labels"],
        report_to="none",
    )
    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        data_collator=SpeechSeq2SeqCollator(processor=processor),
    )

    print(f"train samples: {len(train_ds)}, val samples: {len(val_ds)}")
    if args.dry_run:
        print("--dry-run: plumbing built successfully; skipping training.")
        return

    trainer.train(resume_from_checkpoint=args.resume_from)
    adapter_dir = Path(train_cfg["output_dir"]) / "adapter"
    model.save_pretrained(str(adapter_dir))
    processor.save_pretrained(str(adapter_dir))
    print(f"LoRA adapter saved to {adapter_dir}")
    print("Next: transcribe_for_eval.py + ml/eval/evaluate_stt.mjs (see README, 'Eval gate').")


if __name__ == "__main__":
    main()
