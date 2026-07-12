# Authoring Lessons in a Spreadsheet

This guide is for content authors and reviewers. You do **not** need to know
how to code — everything happens in Google Sheets. A developer turns your
finished sheet into the app's lesson content with one command.

## The workflow

1. **Get a starting sheet.** Either:
   - copy the template at `docs/templates/lessons-template.csv`, or
   - ask the developer for an export of the current lessons for your language
     (they run `pnpm lessons:export <language>` and send you the CSV file).
2. **Open it in Google Sheets** (File > Import > Upload, "Replace spreadsheet").
3. **Edit**: add rows, fix wording, mark rows as reviewed. Tips below.
4. **Download it**: File > Download > **Comma Separated Values (.csv)**.
5. **Send the CSV back to the developer.** They run a checker that either
   applies your changes or sends back a list of problems with the exact row
   numbers to fix (the row numbers match what you see in Google Sheets).

## How the sheet is organised

**One row = one word or phrase.** Everything else on the row says *where*
that word lives: which language, which category, which lesson, and which
level of the lesson. Because these details repeat on every row, you can
select a cell and drag-fill it down — just make sure repeated details stay
**exactly identical** on every row (a one-letter difference is flagged as an
error).

Every lesson has:

- **Level 0 rows** — the lesson's full word list, shown on the lesson
  overview page. For these rows, leave `level_title`, `level_description`
  and `exercise_type` **blank**.
- **Level 1, 2, 3… rows** — the playable exercise levels, in order, with no
  gaps in the numbering.

## What every column means

| Column | What to put there | Example |
| --- | --- | --- |
| `language` | The language code, exactly as given to you | `nan-TW` |
| `category_id` | Short id of the category (group of lessons). Never rename an existing id | `nan-basics` |
| `category_title` | Category name shown in the app | `Hokkien Basics` |
| `category_description` | One-line description of the category | `Everyday Singapore Hokkien, from hello to the bill` |
| `category_icon` | One emoji for the category | `🏮` |
| `lesson_id` | Short id of the lesson. Never rename an existing id (learner progress is attached to it) | `nan-greetings` |
| `lesson_title` | Lesson name shown in the app | `Greetings & Basics` |
| `lesson_description` | One-line description of the lesson | `Say hello and introduce yourself` |
| `difficulty` | `beginner`, `intermediate` or `advanced` | `beginner` |
| `lesson_tags` | Topic tags separated by semicolons | `greeting; polite; daily` |
| `level` | `0` for the word list, `1`, `2`, `3`… for exercise levels | `1` |
| `level_title` | Level name (blank on level 0 rows) | `First Hellos` |
| `level_description` | One-line level description (blank on level 0 rows) | `The four phrases every visit starts with` |
| `exercise_type` | `flashcard`, `matching`, `multiple-choice`, `fill-blank` or `conversation` (blank on level 0 rows) | `flashcard` |
| `dialect_text` | The word/phrase in the language's own script | `多謝` |
| `romanization` | How to pronounce it (Jyutping, Tâi-lô, …) | `to-siā` |
| `english` | The English meaning | `Thank you` |
| `example_sentence` | Optional example sentence using the word. You can write `{{name}}` where the learner's own name should appear | `多謝你來看我。` |
| `turn_speaker` | Only for `conversation` levels: who says this line — `them` or `user`. Leave blank on normal word rows | `them` |
| `turn_hint` | Only for `conversation` levels: an optional hint shown to the learner for their line | `Thank them + say goodbye` |
| `reviewed` | Put `yes` once a native speaker has checked the row (see below) | `yes` |

### Conversation levels

A level with `exercise_type` = `conversation` is a scripted dialogue instead
of a word drill. Each row is one line of the dialogue, in order:

- `turn_speaker` says who speaks: `them` (the other person) or `user` (the learner).
- `dialect_text` / `romanization` / `english` hold the line itself.
- `turn_hint` (only on `user` lines) is a nudge like "Say you're fine + ask back".
- Leave `example_sentence` empty on these rows.

## Rules the checker enforces (write with these in mind)

- **Fill-downs must match exactly.** If row 12 says the lesson title is
  `Eating Out` and row 13 says `Eating out`, that's an error naming both rows.
- **Levels count up without gaps**: 1, 2, 3… A lesson with levels 1 and 3 but
  no 2 is rejected.
- **No duplicate words** in the same lesson and level. The same word may
  appear on different levels (that's how revision levels work).
- **Fill-blank levels need a blank.** At least one word in a `fill-blank`
  level must have an `example_sentence` containing `___` (three underscores)
  where the word goes, e.g. `___，我遲到咗。`. Words without a `___` sentence
  are allowed — they become extra answer options.
- **Every row needs** the language, category and lesson details, a level,
  the word, its romanization and its English meaning. Only
  `example_sentence`, `turn_hint` and `reviewed` may be empty.
- **Ids carry the language prefix.** For every language except Cantonese
  (`yue-HK`), lesson and category ids must start with the language's short
  code, e.g. `nan-greetings`, `nan-basics` for `nan-TW`.
- Tags are separated by semicolons (`;`), so a tag itself can't contain one.

## The `reviewed` column

The `reviewed` column is the native-speaker sign-off. Set it to `yes` once a
native speaker has checked the row. Rows without `yes` still import, but the
developer sees a **warning for each unreviewed row** — so the column doubles
as a to-do list for the review pass. If your sheet doesn't have the column
at all, no warnings are produced.

> **Current content status**: the shipped Cantonese (`yue-HK`) and Hokkien
> (`nan-TW`) lessons were AI-drafted for **Singapore usage** (kopitiam, MRT,
> EZ-Link, pasar malam; Malay loanwords in Hokkien) and are **pending
> Singaporean native-speaker review**. The generated lesson modules cannot
> carry per-row notes, so this `reviewed` column IS the review mechanism:
> export the language, have a Singaporean native speaker check each row, mark
> `yes`, and re-import.

## Google Sheets tips

- Format all cells as **Plain text** (Format > Number > Plain text) so
  Sheets doesn't "helpfully" reformat anything.
- Don't reorder the header row; extra columns are ignored (with a warning).
- Blank rows are fine — they're skipped.
- Keep each lesson's rows together, and each category's lessons together.

---

## For developers

```bash
pnpm lessons:export <languageCode> [outFile]   # registry -> CSV (UTF-8 + BOM), default lessons-<code>.csv
pnpm lessons:import <csvFile>                  # dry run: validate + summary, exit 1 on errors
pnpm lessons:import <csvFile> --write          # regenerate src/data/lessons/<code>/ from the CSV
```

- The import is **dry-run by default**; nothing is written until `--write`.
- `--write` regenerates the per-category `*.ts` modules plus `index.ts` under
  `src/data/lessons/<code>/`, deletes stale generated files in that folder,
  and runs the repo's prettier config over the output. It never touches the
  registry (`src/data/lessons.ts`) — for a **new** language it prints the
  exact snippet to add there. After writing, run `pnpm typecheck && pnpm test`.
- Round-trip fidelity is enforced by `tests/lessonCsv.test.ts`: export ->
  import must deep-equal `getLessonContent(code)` for every shipped language.
- Core modules live in `scripts/lib/` (`lessonCsv.mjs` is the entry point;
  pure, no file I/O, unit-tested). The CLIs load the real registry by
  bundling `src/data/lessons.ts` with esbuild (same pattern as
  `ml/eval/build-normalization.mjs`).
- Template: `docs/templates/lessons-template.csv` (keep it importable — the
  dry run on it must stay error-free).
