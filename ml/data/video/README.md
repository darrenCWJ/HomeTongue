# ml/data/video — drop-in video → training corpus

Turns subtitled dialect video (YouTube URLs or local files) into Whisper-LoRA
training data: extract audio, cut clips along subtitle cues, optionally reject
clips the ASR disagrees with, and emit train-manifest rows that concatenate
directly onto `ml/train/whisper-lora/prepare_data.py` output.

This is the **external/bootstrap corpus** path (docs/ML_PIPELINE.md). The
consented in-app corpus stays the clean core; video data augments it while the
app corpus is small — especially for languages with no public dataset
(Singapore Hokkien, Teochew).

## Prerequisites

| Tool | Needed for | Install |
|---|---|---|
| [ffmpeg](https://ffmpeg.org) (+ffprobe) | audio extraction & clip cutting | `winget install ffmpeg` / `brew install ffmpeg` |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | URL sources | `pip install yt-dlp` / `winget install yt-dlp` |

Neither is needed for `--dry-run` planning against local subtitle files.

## Usage

Scope a video first (downloads subtitles only, plans clips, writes nothing):

```bash
node ml/data/video/ingest-videos.mjs --language yue-HK --dry-run "https://www.youtube.com/watch?v=…"
```

Real ingestion, with ASR-agreement filtering against the dev server
(`pnpm dev` running in another terminal):

```bash
node ml/data/video/ingest-videos.mjs --language yue-HK \
  --verify http://localhost:5173/api/transcribe --max-cer 0.6 \
  --list sources.txt
```

Local files work too — `episode.mp4` with a sidecar `episode.vtt`/`.srt`
(or `--subs path.srt` for a single source). A bare `.vtt`/`.srt` source is
allowed in `--dry-run` to test planning (see `fixtures/sample.vtt`).

Key flags: `--subs-lang` (subtitle language priority, default
`yue,zh-Hant,zh-HK,zh-TW,zh,nan`), `--require-cc` (skip non-Creative-Commons
sources), `--val-pct` (hold out N% of *videos* as `val.jsonl`; default 0),
planner knobs `--merge-gap/--max-clip-sec/--min-clip-sec/--pad-sec`.
Run with no arguments to see the full usage text.

## Output (`out/` by default, git-ignored)

- `clips/<videoId>/NNNN.wav` — 16 kHz mono clips
- `corpus.jsonl` — train-manifest rows: `{ audio, text, speaker: "video:<id>",
  language, source: "video", start, end, origin, verify, created_at }`
- `val.jsonl` — only with `--val-pct > 0`
- `rejected.jsonl` — clips the verifier rejected (CER > `--max-cer`), kept for inspection
- `manifest.json` — per-source provenance (url/file, title, license, subtitle
  language) + drop stats

## How it merges into training

`corpus.jsonl` rows have the same `{audio, text, speaker, language}` shape as
`prepare_data.py` manifests. After running prepare on the app export, append
the video corpus **to the train split only**:

```bash
cat ml/data/video/out/corpus.jsonl >> ml/train/whisper-lora/data/train.jsonl
```

Keep `val.jsonl` = real learner audio: validation must measure the accent and
recording conditions the app actually sees, so external video never goes into
val by default. `--val-pct` exists only for video-only bootstrap experiments
before any app data exists. Speaker IDs are `video:<id>` (one per video), so
the speaker-split guarantee of `prepare_data.py` still holds when appending.

## Data-quality notes

- **Manual subtitles only.** Auto-captions are ASR output — training on them
  just clones another model's errors. Sources without manual subs are skipped.
- **Subtitles are often not verbatim.** Chinese media commonly subtitles
  dialect speech in Standard Written Chinese (speaker says 佢哋喺度食緊飯,
  subtitle reads 他們在吃飯). The `--verify` filter is what catches this:
  clips are blind-transcribed (the subtitle is never sent as a prompt) and
  kept only when CER ≤ `--max-cer`. Tighten toward `0.3` for
  verbatim-subtitled channels; loosen or skip verify only for sources you
  trust. Non-verbatim pairs rejected here are still potential
  translation-training data (`ml/train/slm-dialogue`) — they sit in
  `rejected.jsonl` with transcript + CER attached.
- **Rolling/live captions** (each line shown twice, sliding) are partially
  handled by duplicate-merging; broadcaster block subtitles (PTS Taigi-style)
  work much better than live-caption formats.

## Licensing policy

Recorded per source in `manifest.json` (`license` from yt-dlp metadata).

- **Redistributable / commercial corpora**: only Creative-Commons videos
  (`--require-cc`), content you own, or content you have licensed. The
  consented in-app corpus (docs/ML_PIPELINE.md) is always clean.
- **Local experiments**: broader use of public subtitled video is common
  research practice; the tool warns on every non-CC source so nothing slips
  through silently.
- **Never** DRM-protected streaming services (mewatch, Netflix, …) — that is
  circumvention, not scraping, and this tool will not be extended to do it.
