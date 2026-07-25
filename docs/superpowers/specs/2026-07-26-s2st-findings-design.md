# S2ST research findings, model controls, and dialect classification — design

**Date:** 2026-07-26
**Status:** approved, ready for implementation planning

## Context

A research document (`docs/reference/Latest S2ST Architecture Research.docx`) surveys the
2024–2026 state of speech-to-speech translation: omni-modal LLM architectures, the Mimi
codec and RQ-Transformer, the Hibiki-Zero training paradigm, GRPO, multi-LoRA serving, and
the IMDA governance framework. The question driving this work: what of it can HomeTongue
actually use, and what should be published about the answer.

Assessment against the repo found that the document's core recommendation — direct
omni-modal S2ST — is not applicable, for three reasons, one of which is a product argument
rather than a resource argument. Three sub-parts of the document do transfer. Subsequent
external research found the repo's own corpus assumptions to be significantly out of date.

## Goals

1. Replace the survey document with a repo-grounded findings document that states what is
   usable, what is not, and why.
2. Produce a durable reference for the model-control surface across three layers
   (inference, training, routing).
3. Specify the dialect-variety labelling feature, including whether a separate
   classification app is required (it is not).
4. Publish a paper-formatted article suitable for an external website.
5. Specify — not build — two code changes: per-language model routing, and the dialect
   label column.

## Non-goals

- Building the code in this pass. Code scope is fixed here; implementation follows after
  this spec and its plan are reviewed.
- Training any model. The corpus has zero consented samples
  (`ml/train/README.md`); no training step is reachable.
- Direct S2ST, voice cloning, streaming/full-duplex audio, or any change to the Mimi/RVQ
  or RQ-Transformer layer. Out of scope permanently for this product, per the findings.
- An end-user dialect-labelling UI. Deferred; specified in the feature doc as a later
  phase, not built or scheduled here.

## Findings that drive the design

### F1 — The cascade is a product requirement, not legacy debt

The source document treats the ASR→MT→TTS cascade as a defect to eliminate. HomeTongue is
a language-*learning* product: it renders the transcript, the Jyutping, the word breakdown,
and `scoreDialectAccuracy`. A direct speech-to-speech model that bypasses the text
intermediate removes the product surface. This is the strongest argument against the
document's core recommendation and it is not a resource constraint.

### F2 — Hibiki-Zero is real and still does not apply

`arXiv:2602.11072`; open weights at `kyutai/hibiki-zero-3b-pytorch-bf16`; ICML 2026 poster
66094. It supports **French, Spanish, Portuguese, German → English only**. Wrong language
pair and wrong direction for Cantonese/Hokkien → English. The source document cites the
ICML link for the 2025 Hibiki paper (`/virtual/2025/poster/44512`) rather than the 2026
Hibiki-Zero poster.

### F3 — The corpus assumptions in `ML_TRAINING_PLAN.md` are stale

`docs/ML_TRAINING_PLAN.md` budgets step 2 against "Common Voice `yue`, MDCC ~73 h".
WenetSpeech-Yue (Sept 2025) provides ~21,800 hours of annotated Cantonese — roughly 300×
that assumption. Step 2's feasibility and its data gate both change.

### F4 — Singapore has a national speech corpus under an open licence

The IMDA National Speech Corpus is ~10,600 hours of Singapore-accented speech under the
Singapore Open Data License, available for commercial use on request. MERaLiON-AudioLLM
(`arXiv:2412.09818`) is built on it. The MERLIon challenge (`arXiv:2305.19493`) addresses
Mandarin–English code-switching in Singapore speech specifically. The same agency (IMDA)
supplies both this corpus and the governance framework the source document cites.

### F5 — LID-routed adapters are published precedent

Assigning one LoRA adapter per language and routing speech features by language ID is
established (`arXiv:2507.18051`). This is the missing link between the routing change and
the dialect label: a variety classifier makes adapter selection automatic rather than a
manual environment variable.

### F6 — GRPO needs an early-stopping guardrail

Practitioners report reward variance collapse under long GRPO schedules
(`arXiv:2605.15976`), with early stopping on a held-out dev set treated as required rather
than optional. Any GRPO step added to the training plan must specify this.

### F7 — Pack coverage is inverted against Singapore demographics

Singapore Chinese dialect groups: Hokkien 41.1%, Teochew 21.0%, Cantonese 15.4%, Hakka
7.9%, Hainanese 6.7%. The fully-supported pack is Cantonese (`yue-HK`). The largest group,
Hokkien, is the `nan-TW` pack with `sttLanguages: []` — text-only, no speech path.

### F8 — The label gap

`speech_samples.language` (migration 0002) defaults to `'yue-HK'` and records *which pack
was active*, not *what variety was spoken*. SG Cantonese, HK-influenced Cantonese, Hokkien,
and code-switched speech all collapse into one label. Per-variety training and per-variety
accuracy measurement are both impossible on this schema.

## Deliverables

### D1 — `docs/S2ST_FINDINGS.md`

Repo-grounded findings; supersedes the `.docx` as the working reference. Sections:
feasibility audit (F3, F4 — corpus re-audit table); what the literature offers and what it
does not (F1, F2); transferable techniques (LID-routed multi-LoRA, GRPO with verifiable
rewards, curriculum/expressivity, governance); corrections to the source document; evidence
table with canonical citations.

### D2 — `docs/MODEL_CONTROLS.md`

The control surface across three layers, each row stating what exists today versus what is
proposed:

- **Inference-time**: dialect strictness, formality/register, SG-vs-HK lexicon bias,
  scoring harshness, latency-vs-quality. The prompt-and-proxy analogue of the source
  document's `--cfg-coef` section.
- **Training-time**: GRPO reward composition over the existing verifiable signals
  (`pack.scoring.fallbackMatch`, `ml/eval/normalization.json`, stored exam `score`),
  dialect-marker rewards, and the F6 early-stopping guardrail.
- **Routing/serving**: per-language model resolution, multi-LoRA adapter selection,
  eval-gated rollout and rollback.

### D3 — `docs/DIALECT_CLASSIFICATION.md`

Feature specification. Opens with the answer to "do we need a separate app": no — `admin/`
already provides the review surface (`ReviewQueuePage`, `SampleCard`, `AudioPlayer`,
`reviewApi`, dashboard) backed by `sample_reviews` (migration 0005). The gap is the label
(F8), not the application. Covers: schema, contribution surfaces, precedence, the
classifier, and how classification feeds adapter routing (F5). Phases the end-user
labelling UI as later work.

### D4 — `docs/blog/dialect-model-controls.md`

The public article, in full paper format (see below).

### D5 — Updates to existing docs

- `docs/ML_TRAINING_PLAN.md`: step-2 corpus and gate revised per F3/F4; step 3 gains GRPO
  as an option alongside DPO, with the F6 guardrail.
- `docs/ML_PIPELINE.md`: the dialect label enters the collection description and the
  export.

### D6 — Provenance

`Latest S2ST Architecture Research.docx` moves from `docs/` to `docs/reference/` and is
committed. It is currently untracked; the findings document corrects it, so the corrected
artefact belongs in history.

## Code design (specified here, built in a later pass)

### C1 — Per-language model routing

**Problem.** `resolveBaseUrl` in `api/_lib/languageManifest.js` already resolves a
per-language base URL, but the model name is global: `api/_lib/chatCore.js:67` reads a
single `OPENAI_MODEL`. With N dialect packs this forces one GPU endpoint per dialect, which
is the cost pattern multi-LoRA serving exists to avoid.

**Change.** Add `resolveModel(kind, languageCode, env)` alongside `resolveBaseUrl`, same
null-safe shape and same `envSuffix` derivation:

- `llm`: `LLM_MODEL_<SUFFIX>` → `OPENAI_MODEL` → `VITE_OPENAI_MODEL` → `DEFAULT_MODEL`
- `stt`: `STT_MODEL_<SUFFIX>` → provider default

There is deliberately **no global `STT_MODEL`**. The STT path already accepts a
client-supplied `model` validated against `ALLOWED_MODELS`; introducing a global
server-side override as well would create two competing sources of truth for the same
field. The per-language variable is the only server-side STT model control.

`chatCore.js` replaces its flat env read with `resolveModel("llm", language, env)`.

**The allowlist asymmetry (important).** `ALLOWED_MODELS` in
`api/_lib/transcribeCore.js:17` guards the **client-supplied** `model` field. That is a
security boundary and it stays exactly as-is: a client must not be able to name an
arbitrary upstream model. A **server-configured** `STT_MODEL_<SUFFIX>` bypasses the
allowlist because it originates in trusted environment configuration, not in the request
body. Conflating the two would either break the boundary or make it impossible to name a
LoRA adapter. These are two distinct values that must not share a code path.

**Forwarding.** The custom-STT branch currently posts `{audio, language, prompt}`. It gains
`model` (the server-resolved value, or null).

**Dev middleware.** `vite.config.ts` mirrors all three endpoints and must stay in sync per
`CLAUDE.md`.

### C2 — Dialect label column

**Migration `0009_spoken_variety.sql`** adds three nullable columns to `speech_samples`:

| Column | Type | Notes |
|---|---|---|
| `spoken_variety` | `text` | pack-defined vocabulary; null = unknown |
| `variety_source` | `text` | `check in ('self','reviewer','classifier')` |
| `variety_confidence` | `real` | classifier confidence; null for human sources |

All nullable, no backfill. An absent label means unknown, which is the truthful
representation of existing rows.

**Precedence.** `reviewer > self > classifier`. A classifier write must never overwrite a
human label. Enforced in the write path, not only by convention.

**Vocabulary location.** The variety list belongs to the language pack, per the `CLAUDE.md`
convention that language-specific data lives in `src/languages/<code>/` and never inline in
services. **Every pack declares its own `varieties` list** — `yue-HK` and `nan-TW` alike —
and the schema stays variety-agnostic, storing whatever string the active pack supplied.
A pack that declares no varieties simply never produces a label.

**Threading.** `src/services/speechSampleService.ts` (`SpeechSampleInput`,
`buildSpeechSampleRow`) → `scripts/export-training-data.mjs` → admin `SampleCard` and
`reviewApi`.

**RLS.** Inherits the existing `speech_samples` policies. Reviewer-sourced writes are gated
on `is_admin`, matching the `sample_reviews` pattern in migration 0005.

## Error handling

Model resolution is null-safe and never throws. Unknown or missing language codes fall
through to the global value, then to the provider default — identical to `resolveBaseUrl`,
whose documented contract is that older and newer clients interoperate. Introducing a throw
would break that contract.

All three label columns are nullable at every layer. Absent labels are a normal state, not
an error, and must not block export, review, or capture.

## Testing

- `resolveModel` unit tests: full precedence chain per kind; unknown-language fallthrough;
  empty-string env values treated as unset (matching `resolveBaseUrl`).
- `transcribeCore` test asserting the allowlist asymmetry: a client-supplied model outside
  `ALLOWED_MODELS` still returns 400, while a server-configured `STT_MODEL_<SUFFIX>`
  reaches the custom endpoint unvalidated against that list.
- `chatCore` test: per-language model override wins over `OPENAI_MODEL`.
- `tests/languageManifest.test.ts` parity check extended to the new env scheme.
- Migration applied to a Supabase branch first, never directly to production.
- `pnpm typecheck && pnpm lint && pnpm test` green before commit, per `CLAUDE.md`.

## The article

**Title.** "Dialect-Preserving Speech Translation for Heritage Language Learning: A System
Description and Feasibility Audit"

**Genre.** System description / position paper, not an empirical study. There are no
experiments, because there is no corpus. Section 5 is therefore *Design Rationale and
Implementation*, not *Results*. The article states the zero-sample position explicitly
rather than implying results it does not have.

**Structure.** Title; abstract (150–250 words); 1. Introduction with enumerated
contributions; 2. Background and Related Work; 3. System Architecture; 4. System Setup; 5.
Design Rationale and Implementation; 6. Discussion; 7. Limitations; 8. Ethical
Considerations; 9. Conclusion and Future Work; References; Appendix.

**Conventions.** Numbered sections; table captions above, figure captions below; every
figure and table referenced by number in prose; numbered references with canonical
URLs/DOIs; reproducibility statement.

**Length.** 1,500–2,000 words excluding references.

### Figures and tables

Mermaid, matching the convention set in commit 172009f. SVG export only if the target site
cannot render Mermaid.

| Ref | Type | Content |
|---|---|---|
| Fig. 1 | Mermaid flowchart | Three architecture generations; HomeTongue's position marked |
| Fig. 2 | Mermaid flowchart | Current pipeline, showing the text intermediate feeding transcript, Jyutping and scoring — the F1 argument in one diagram |
| Fig. 3 | Mermaid flowchart | Routing: N endpoints today vs. one base model + LID-routed adapters |
| Fig. 4 | Mermaid flowchart | Label → train → route loop with `reviewer > self > classifier` precedence |
| Fig. 5 | Mermaid pie | SG dialect demographics vs. pack coverage (F7) |
| Table 1 | Markdown | Corpus re-audit: hours, licence, applicability |
| Table 2 | Markdown | Model-controls taxonomy: layer, knob, status today, proposed |
| Table 3 | Markdown | Corrections to the source document |

## Sequencing

D6 and D1 first (provenance, then findings — everything else cites the findings), then D2
and D3 in parallel, then D5, then D4 last since the article distils all of them. C1 and C2
are specified within D2/D3 and implemented in a later pass.

## Open questions

1. Whether Google Chirp3-HD output carries SynthID watermarking. Determines whether the
   governance section can claim provenance or must recommend in-app disclosure labelling as
   a substitute. To be verified against Google Cloud documentation during D1, not assumed.
2. Whether IMDA National Speech Corpus licence terms permit derived model weights to be
   used commercially without further notification. Affects whether F4 is actionable or
   merely informational. Requires reading the licence agreement, not a search summary.
3. Author attribution and affiliation for the published article. Needed before D4 is
   finalised.
