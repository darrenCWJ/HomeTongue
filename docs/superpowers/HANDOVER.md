# Handover — S2ST findings documentation set

> **Superseded — 2026-07-26.** This handover describes a mid-execution state. The branch has
> since completed: Tasks 1–8 all executed and reviewed (plus the mid-execution Task 5b,
> Singapore-local corpus routes), final whole-branch review passed, verification suite green.
> Kept for provenance; do not resume from it.

**Date:** 2026-07-26
**Branch:** `docs/s2st-findings` (branched from `main` at `b6970b6`)
**Working tree:** clean
**Stopped at:** Task 4 committed, review **not yet run** (user interrupted the review dispatch)

---

## How to resume

Say to a fresh session:

> Continue executing `docs/superpowers/plans/2026-07-26-s2st-findings-docs.md` using the
> superpowers:subagent-driven-development skill. Read `.superpowers/sdd/progress.md` and
> `.superpowers/sdd/HANDOVER.md` first. Tasks 1–3 are complete and reviewed; Task 4 is
> committed but unreviewed. Resume by reviewing Task 4, then continue with Tasks 5–8.

The ledger at `.superpowers/sdd/progress.md` is the source of truth for what is done.
**Do not re-dispatch a task the ledger marks complete.** `.superpowers/sdd/` is git-ignored
scratch — `git clean -fdx` will destroy it, in which case recover from `git log`.

---

## What this work is

Assessment of a research document (`docs/reference/Latest S2ST Architecture Research.docx`)
against this repo, producing four documents and two doc updates, ending in a publishable
system-description paper.

- **Spec:** `docs/superpowers/specs/2026-07-26-s2st-findings-design.md`
- **Plan:** `docs/superpowers/plans/2026-07-26-s2st-findings-docs.md`

Code scope (per-language model routing `C1`, dialect label column `C2`) is **specified only,
not built** this pass. That is deliberate — see the spec's Non-goals.

---

## Progress

| Task | Deliverable | Status |
|---|---|---|
| 1 | `scripts/check-docs-refs.mjs` + `pnpm docs:check` | complete, reviewed |
| 2 | SynthID + NSC licence questions resolved in spec | complete, reviewed |
| 3 | `docs/S2ST_FINDINGS.md` | complete, reviewed |
| 4 | `docs/MODEL_CONTROLS.md` | **committed, NOT reviewed** |
| 5 | `docs/DIALECT_CLASSIFICATION.md` | not started |
| 6 | `ML_TRAINING_PLAN.md` + `ML_PIPELINE.md` updates | not started |
| 7 | `docs/blog/dialect-model-controls.md` (the paper) | not started |
| 8 | Cross-link + final verification sweep | not started |

Commits on this branch, oldest first:

```
5b9a292 chore: add docs reference-integrity checker
e7acf4f fix(docs): strip fenced code blocks before scanning doc references
d206bdd docs: resolve SynthID and NSC licensing open questions
b60b82e docs: calibrate certainty in SynthID and NSC licensing resolutions
3f63f7c docs: repo-grounded S2ST findings, superseding the survey document
8775c48 docs: fix seven S2ST_FINDINGS review findings against primary sources
7032bb2 docs: clarify NSC retrieval method and census gap framing
cf32e63 docs: model control surface across inference, training and routing
0c30d87 fix(docs): strip URL fragments before resolving link targets
```

Briefs already extracted and ready: `.superpowers/sdd/task-4-brief.md`, `task-5-brief.md`.
Extract later ones with:

```bash
bash "$HOME/.claude/plugins/cache/claude-plugins-official/superpowers/6.1.1/skills/subagent-driven-development/scripts/task-brief" docs/superpowers/plans/2026-07-26-s2st-findings-docs.md N
```

---

## IMMEDIATE NEXT STEP — review Task 4

Task 4 (`cf32e63`) and the checker fix (`0c30d87`) are committed but unreviewed. Generate the
package and dispatch a reviewer:

```bash
bash "$HOME/.claude/plugins/cache/claude-plugins-official/superpowers/6.1.1/skills/subagent-driven-development/scripts/review-package" 7032bb2 HEAD
```

The review must prioritise the **security-relevant** content in
`docs/MODEL_CONTROLS.md` § "Proposed additions in detail". A later implementer builds from
that text, so ambiguity there becomes a vulnerability. It must state unambiguously:

- `ALLOWED_MODELS` in `api/_lib/transcribeCore.js` validates the **client-supplied** `model`
  field and remains a security boundary.
- A **server-configured** `STT_MODEL_<SUFFIX>` bypasses that allowlist, because it originates
  in trusted environment configuration rather than the request body.
- The two values **must not share a code path**.
- There is deliberately **no global `STT_MODEL`** — the STT path already accepts a
  client-supplied `model`, and a second server-side global would create two competing sources
  of truth for one field.

The writer reported one correction to the brief: the "scoring harshness" control's fixed
rubric lives in the pack's `buildScoringSystem` prompt (`src/languages/yue-HK/index.ts:113`,
fallback at `:244`), not only at the `translationService.ts` call site. Verify that.

---

## Findings that corrected the plan — carry these forward

These were discovered during execution and **override** what the spec and plan say. Tasks 6
and 7 in particular must reflect them.

### Licensing reversal (most important)

- **WenetSpeech-Yue's dataset is CC BY-NC 4.0.** The Apache-2.0 on that repo covers the
  annotation *pipeline code* only. A model trained on it **cannot ship commercially.**
  The plan's headline "~21,800 h, 300× the stale assumption" is about *availability*, not
  usability. Usable-in-a-shipping-model drops to ~319 CC0 hours (Common Voice `yue` 210.70 h
  + `zh-HK` 108.54 h).
- **Hibiki-Zero's weights are CC BY-NC-SA 4.0** — stated in the model card body, not the YAML
  `license` field.
- Consequence, now a stated finding: the open ecosystem for dialect S2ST is substantially
  **non-commercial**, so availability and usability diverge for any shipping product.

### Corpus facts

- **IMDA NSC hours are not published.** IMDA states ~1.2 TB, never a duration. Koh et al.,
  Interspeech 2019 states "more than 2000 hours" for an *earlier* version. The widely repeated
  "~10,600 hours" traces only to secondary sources. The NSC page is client-rendered, so the
  absence cannot be confirmed by plain HTTP fetch.
- **NSC licence:** Singapore Open Data Licence v1.0 — commercial use of derived work permitted,
  attribution required, no notification obligation. **Caveat that must always accompany this:**
  the registration/download flow was never completed, so terms presented at download were never
  inspected. Confirm before shipping a model trained on NSC data.
- The licensing PDF cited in the plan (`imda-dsl--tech-licensing.pdf`) is the DSL **Technology**
  Licensing template for NSTT tools — **not** the corpus licence. Do not cite it as such.
- **TaigiSpeech** is ~6.1 h, an 8-class intent-classification set, in Taiwanese. Not an ASR
  corpus, not Singapore Hokkien. **No Hokkien speech corpus was identified at all** — which
  makes the coverage gap worse than the plan assumed, not better.

### Other corrections

- **Demographics are Census 2020**, not 2000: Hokkien 39.3%, Teochew 19.4%, Cantonese 14.3%,
  Hakka 8.6%, Hainanese 6.1% (total 3,006,769). Rank order unchanged from 2000, so the coverage
  argument holds and strengthens. Census 2020's headline Statistical Release 1 does *not* carry
  this breakdown — cite the granular data.gov.sg dataset.
  **Figure 5 in Task 7 must use the 2020 figures**, not the 2000 ones written into the plan.
- **SynthID for Google Chirp 3: HD is *not documented*** — distinct from *documented as absent*.
  Preserve that distinction; recommend in-app disclosure labelling, never claim provenance.
  Do not resurrect the "Google documents it elsewhere so the silence is meaningful" argument —
  it was checked and does not hold (Gemini 3.1 Flash TTS is watermarked per a Google blog post
  yet its own reference page is equally silent).
- Hibiki-Zero's Italian adaptation data is **coarse-aligned**, not "unaligned".

---

## Open minor findings for the final review to triage

In `scripts/check-docs-refs.mjs`:

- `decodeURI()` throws `URIError` on a literal `%` in a link target — would crash the checker
  with a stack trace rather than reporting an offender. Latent; no such filename exists yet.
- Fence stripping covers fenced blocks only, not single-backtick inline code spans. Illustrate
  link syntax inside fenced blocks, never inline, or you get a false positive.
- Offender messages use OS-native path separators (backslashes on Windows), so they do not
  match the forward-slash examples in the plan text.

---

## Standing constraints for every remaining task

- **Documentation-only.** Nothing under `src/`, `api/`, `supabase/migrations/`, or `admin/`.
  Task 8 verifies this with `git diff --stat cd8d3b5..HEAD -- src api supabase admin` (expect
  empty).
- **Singapore usage throughout.** `yue-HK` and `nan-TW` are speech-locale identifiers, not a
  claim that the app targets Hong Kong or Taiwan — say so wherever they appear.
- **Zero consented samples.** Nothing may imply a trained model, measured result, or populated
  benchmark exists.
- Canonical citations only — arXiv `/abs/`, ACL Anthology, ISCA Archive, data.gov.sg, official
  vendor docs. Never a Scribd mirror, content farm, or AI-summary site.
- Table captions **above**, figure captions **below**, every figure and table referenced by
  number in prose.
- Markdown links resolve relative to the containing file.
- Commit after every task, conventional commit format.

### Expected verification state

`pnpm docs:check` currently exits **1** with exactly one offender:

```
docs\S2ST_FINDINGS.md: missing target "DIALECT_CLASSIFICATION.md"
```

This is a deliberate forward reference from Task 3. **Task 5 creates that file and the check
must pass clean from then on.** Any *other* offender at any point is a real defect.

---

## Notes on running the remaining tasks

- The recurring failure mode across every task so far has been **overstatement, not error** —
  claims stated with more certainty than their source supports. Every review has found some.
  Instruct writers to mark interpretation as interpretation and to prefer an explicit unknown.
  Instruct reviewers to verify claims against primary sources rather than trusting the report.
- Review has been worth its cost: it caught two Critical factual errors in Task 3 alone, plus
  the licensing reversal that changes a headline finding.
- Task 7 (the paper) is the highest-stakes writing task — it publishes under the user's byline
  as **Darren Chua**, no affiliation, `v1.0 — 2026-07-26`. It is a **system description**, not
  an empirical study: §5 is *Design Rationale and Implementation*, never *Results*, because
  there is no corpus. It pre-registers the eval protocol (CER/WER vs the `gpt-4o-transcribe`
  baseline, speaker-hash split, ship bar ≥15–20% relative CER reduction) so a later revision
  fills in numbers against a published threshold.
- After Task 8, run the final whole-branch review on the most capable model, then use
  superpowers:finishing-a-development-branch.
