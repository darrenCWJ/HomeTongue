# ML data pipeline (dialect model training)

Goal: a clean, **consented**, labeled corpus of dialect speech that can fine-tune an STT model (e.g. Whisper LoRA) or adapt a small language model to understand Cantonese and, later, other dialects. Everything here is config-gated on Supabase cloud mode.

## Consent model (privacy first)

Two independent flags on the user's profile, both **default OFF**, toggled in Profile settings:

| Flag | Meaning |
|---|---|
| `data_collection_consent` | text-level data may be stored: expected phrase, transcript, correction, score |
| `audio_retention_consent` | additionally, the actual recording may be kept (private storage bucket) |

Enforcement is layered: the app never writes without the flag, **and** the database RLS insert policies re-check the profile flag server-side (`supabase/migrations/0002_ml_data_pipeline.sql`), so a buggy or malicious client cannot insert unconsented rows. Withdrawal of consent deletes the user's rows. All rows cascade-delete with the account.

## What gets collected (when consented)

| Source | Signal | Why it's valuable |
|---|---|---|
| Exam attempts | `expected_text` + `transcript` + `score` (+ audio) | Gold supervised pairs: known target vs. what STT heard |
| Chat transcript edits | `transcript` + `corrected_text` | Human-labeled STT error corrections |
| Suggestion ratings | thumbs up/down on AI replies | Preference data for reply-generation tuning |

Tables: `speech_samples`, `corrections` (see migration 0002). Audio lands in the private `recordings` storage bucket under `<user_id>/…`, referenced by `audio_url`.

## Export for training

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<server-only-key> \
node scripts/export-training-data.mjs --language yue-HK --out training-export/
```

Produces `speech_samples.jsonl` + `corrections.jsonl` with user ids replaced by per-export salted hashes (speaker grouping without identity). The service-role key must never be committed or shipped — run this from a trusted machine/CI secret only.

## Training path (future)

1. **STT**: Whisper (or gpt-4o-transcribe-class distillation) LoRA fine-tune on `expected_text`/audio pairs, evaluated against the held-out exam scores.
2. **Translation/reply quality**: SLM (e.g. Qwen-class) fine-tuned on correction pairs and rated suggestions.
3. **Serving**: swap models behind the existing `/api/chat` + `/api/transcribe` contracts — the client never changes.
