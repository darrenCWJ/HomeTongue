// Drop-in video → training-corpus ingestion (docs/ML_PIPELINE.md, "external
// drop-in video corpus"). Turns subtitled dialect video into train-manifest
// rows that concatenate directly onto ml/train/whisper-lora/prepare_data.py
// output — see ml/data/video/README.md for the licensing policy and workflow.
//
// Usage:
//   node ml/data/video/ingest-videos.mjs --language yue-HK [flags] <source ...>
//
// Sources (mix freely):
//   https://…                video URL — needs yt-dlp (+ ffmpeg); manual subs only
//   path/to/episode.mp4      local media — needs ffmpeg + sidecar .vtt/.srt (or --subs)
//   path/to/episode.vtt      bare subtitle file — planning/--dry-run only
//   --list sources.txt       one source per line, `#` comments
//
// Flags:
//   --language CODE          REQUIRED corpus language label (e.g. yue-HK)
//   --out DIR                output dir (default ml/data/video/out)
//   --subs-lang CSV          subtitle language priority (default yue,zh-Hant,zh-HK,zh-TW,zh,nan)
//   --subs FILE              explicit subtitle file (single local media source only)
//   --verify URL             /api/transcribe-shaped endpoint for ASR-agreement filtering
//                            (e.g. http://localhost:5173/api/transcribe with `pnpm dev` running)
//   --max-cer N              reject verified clips with CER above N (default 0.6)
//   --require-cc             skip sources without a Creative Commons license
//   --val-pct N              hold out N% of VIDEOS as val.jsonl (default 0: external
//                            data augments train only; keep val = real learner audio)
//   --merge-gap/--max-clip-sec/--min-clip-sec/--pad-sec   clip planner knobs
//   --dry-run                parse subtitles + plan clips + report; download subs at
//                            most; never runs ffmpeg, verify, or writes files
//
// Output (<out>/): clips/<videoId>/NNNN.wav, corpus.jsonl (+ val.jsonl),
// rejected.jsonl (verify mismatches), manifest.json (provenance + stats).

import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { basename, dirname, extname, join } from "path";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import { parseSubtitles, planClips, DEFAULT_PLANNER_OPTIONS } from "./subtitles.mjs";
import { loadNormalizer, transcribeClip } from "./verify.mjs";
import { characterErrorRate } from "../../eval/cer.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SUBTITLE_EXTS = new Set([".vtt", ".srt"]);
const DEFAULT_SUBS_PRIORITY = "yue,zh-Hant,zh-HK,zh-TW,zh,nan";
const VAL_HASH_BUCKETS = 100; // mirrors ml/train/whisper-lora/prepare_data.py

// ---------- arguments ----------

const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const FLAGS_WITH_VALUE = new Set([
  "--language", "--out", "--subs-lang", "--subs", "--verify", "--max-cer",
  "--val-pct", "--merge-gap", "--max-clip-sec", "--min-clip-sec", "--pad-sec", "--list",
]);

const options = {
  language: argValue("--language", null),
  outDir: argValue("--out", join(here, "out")),
  subsPriority: argValue("--subs-lang", DEFAULT_SUBS_PRIORITY).split(",").map((s) => s.trim()).filter(Boolean),
  subsFile: argValue("--subs", null),
  verifyEndpoint: argValue("--verify", null),
  maxCer: Number(argValue("--max-cer", "0.6")),
  requireCc: args.includes("--require-cc"),
  valPct: Number(argValue("--val-pct", "0")),
  dryRun: args.includes("--dry-run"),
  planner: {
    mergeGapSec: Number(argValue("--merge-gap", String(DEFAULT_PLANNER_OPTIONS.mergeGapSec))),
    maxClipSec: Number(argValue("--max-clip-sec", String(DEFAULT_PLANNER_OPTIONS.maxClipSec))),
    minClipSec: Number(argValue("--min-clip-sec", String(DEFAULT_PLANNER_OPTIONS.minClipSec))),
    padSec: Number(argValue("--pad-sec", String(DEFAULT_PLANNER_OPTIONS.padSec))),
  },
};

function collectSources() {
  const sources = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--list") {
      const listPath = args[++i];
      if (!listPath || !existsSync(listPath)) fail(`--list file not found: ${listPath}`);
      for (const line of readFileSync(listPath, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) sources.push(trimmed);
      }
    } else if (FLAGS_WITH_VALUE.has(arg)) {
      i++;
    } else if (!arg.startsWith("--")) {
      sources.push(arg);
    }
  }
  return sources;
}

function fail(message) {
  console.error(message);
  console.error("\nUsage: node ml/data/video/ingest-videos.mjs --language yue-HK [flags] <source ...>");
  console.error("See ml/data/video/README.md for full documentation.");
  process.exit(1);
}

// ---------- external tools ----------

function run(bin, binArgs, { capture = false } = {}) {
  const result = spawnSync(bin, binArgs, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
  });
  if (result.error) throw new Error(`${bin} failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    const stderr = capture ? (result.stderr ?? "").slice(-500) : "(see output above)";
    throw new Error(`${bin} ${binArgs[0]} exited ${result.status}: ${stderr}`);
  }
  return capture ? result.stdout : "";
}

const hasTool = (bin, versionArg) =>
  spawnSync(bin, [versionArg], { stdio: "ignore" }).status === 0;

// ---------- per-source ingestion ----------

const isUrl = (s) => /^https?:\/\//i.test(s);
const sanitizeId = (s) => s.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 80) || "video";
const isCreativeCommons = (license) => /creative commons/i.test(license ?? "");

function pickSubtitleLang(available, priority) {
  for (const want of priority) {
    const hit =
      available.find((l) => l === want) ??
      available.find((l) => l.startsWith(`${want}-`)) ??
      available.find((l) => want.startsWith(`${l}-`));
    if (hit) return hit;
  }
  return null;
}

/** yt-dlp flow: metadata → license/sub checks → download subs (+media unless dry-run). */
function resolveUrlSource(url) {
  const meta = JSON.parse(run("yt-dlp", ["-J", "--no-playlist", url], { capture: true }));
  if (meta._type === "playlist") {
    return { skipped: `playlist URL — expand it first: yt-dlp --flat-playlist --print "%(url)s" <url> > sources.txt, then --list sources.txt` };
  }
  const id = sanitizeId(meta.id ?? "video");
  const title = meta.title ?? url;
  const license = meta.license ?? null;
  if (options.requireCc && !isCreativeCommons(license)) {
    return { id, title, license, skipped: `license is ${license ?? "unknown"} — not Creative Commons (--require-cc)` };
  }
  if (!isCreativeCommons(license)) {
    console.warn(`  WARN ${id}: license ${license ?? "unknown"} — fine for local experiments; keep out of redistributable/commercial corpora`);
  }
  const subtitleLang = pickSubtitleLang(Object.keys(meta.subtitles ?? {}), options.subsPriority);
  if (!subtitleLang) {
    return { id, title, license, skipped: `no MANUAL subtitles in [${options.subsPriority.join(", ")}] (auto-captions are ignored by design)` };
  }

  const dlDir = join(options.outDir, "downloads", id);
  mkdirSync(dlDir, { recursive: true });
  const dlArgs = [
    "--no-playlist", "--no-progress", "--write-subs", "--sub-langs", subtitleLang,
    "--convert-subs", "vtt", "-o", join(dlDir, "%(id)s.%(ext)s"),
  ];
  dlArgs.push(...(options.dryRun ? ["--skip-download"] : ["-f", "bestaudio/best"]));
  run("yt-dlp", [...dlArgs, url], { capture: true });

  const files = readdirSync(dlDir);
  const subFile = files.find((f) => f === `${meta.id}.${subtitleLang}.vtt`) ?? files.find((f) => f.endsWith(".vtt"));
  if (!subFile) return { id, title, license, skipped: "yt-dlp reported subtitles but none were downloaded" };
  const mediaFile = options.dryRun
    ? null
    : files.find((f) => f.startsWith(`${meta.id}.`) && !SUBTITLE_EXTS.has(extname(f)));
  if (!options.dryRun && !mediaFile) return { id, title, license, skipped: "media download failed" };
  return {
    id, title, license, subtitleLang,
    kind: "url", ref: url,
    subsPath: join(dlDir, subFile),
    mediaPath: mediaFile ? join(dlDir, mediaFile) : null,
  };
}

function resolveLocalSource(path, totalSources) {
  if (!existsSync(path)) return { skipped: "file not found" };
  const ext = extname(path).toLowerCase();
  const id = sanitizeId(basename(path, extname(path)));
  if (SUBTITLE_EXTS.has(ext)) {
    if (!options.dryRun) return { id, skipped: "bare subtitle file — supply the media file, or use --dry-run to plan" };
    return { id, title: basename(path), license: "local file", kind: "subtitle", ref: path, subsPath: path, mediaPath: null };
  }
  let subsPath = options.subsFile;
  if (subsPath && totalSources > 1) fail("--subs only works with a single local media source");
  if (!subsPath) {
    const base = path.slice(0, -ext.length);
    subsPath = [".vtt", ".srt"].map((e) => base + e).find(existsSync) ?? null;
  }
  if (!subsPath || !existsSync(subsPath)) {
    return { id, skipped: `no sidecar subtitles (${basename(path, ext)}.vtt/.srt) — or pass --subs` };
  }
  return { id, title: basename(path), license: "local file", kind: "media", ref: path, subsPath, mediaPath: path };
}

function extractAudio(source) {
  const fullWav = join(options.outDir, "downloads", source.id, "audio-16k.wav");
  mkdirSync(dirname(fullWav), { recursive: true });
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", source.mediaPath, "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", fullWav]);
  let duration = Infinity;
  try {
    const probed = Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", fullWav], { capture: true }).trim());
    if (Number.isFinite(probed) && probed > 0) duration = probed;
  } catch {
    // ffprobe missing — only tail-clip padding loses its clamp, which is safe.
  }
  return { fullWav, duration };
}

async function cutAndVerify(source, clips, normalize, runTimestamp) {
  const clipDir = join(options.outDir, "clips", source.id);
  mkdirSync(clipDir, { recursive: true });
  const kept = [];
  const rejected = [];
  let verifyErrors = 0;
  for (let n = 0; n < clips.length; n++) {
    const clip = clips[n];
    const clipName = `${String(n + 1).padStart(4, "0")}.wav`;
    const clipPath = join(clipDir, clipName);
    run("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(clip.start), "-t", (clip.end - clip.start).toFixed(3), "-i", source.fullWav, "-c:a", "pcm_s16le", clipPath]);

    let verify = null;
    if (options.verifyEndpoint) {
      try {
        const transcript = await transcribeClip(options.verifyEndpoint, clipPath, options.language);
        const cer = characterErrorRate(clip.text, transcript, normalize);
        verify = { transcript, cer };
      } catch (err) {
        verify = { error: String(err.message ?? err) };
        verifyErrors++;
      }
    }

    const row = {
      audio: `clips/${source.id}/${clipName}`,
      text: clip.text,
      speaker: `video:${source.id}`,
      language: options.language,
      source: "video",
      start: clip.start,
      end: clip.end,
      origin: { kind: source.kind, ref: source.ref, title: source.title, license: source.license, subtitle_lang: source.subtitleLang ?? null },
      verify,
      created_at: runTimestamp,
    };
    if (verify && typeof verify.cer === "number" && verify.cer > options.maxCer) {
      rejected.push({ ...row, rejection: `CER ${verify.cer.toFixed(3)} > ${options.maxCer}` });
    } else {
      kept.push(row);
    }
  }
  return { kept, rejected, verifyErrors };
}

// ---------- main ----------

async function main() {
  if (!options.language) fail("Missing required flag: --language (corpus language label, e.g. yue-HK)");
  if (![options.maxCer, options.valPct, ...Object.values(options.planner)].every(Number.isFinite)) {
    fail("Numeric flags must be numbers");
  }
  const sources = collectSources();
  if (sources.length === 0) fail("No sources given");

  const needsYtdlp = sources.some(isUrl);
  const needsFfmpeg = !options.dryRun && sources.some((s) => !SUBTITLE_EXTS.has(extname(s).toLowerCase()));
  if (needsYtdlp && !hasTool("yt-dlp", "--version")) fail("yt-dlp not found on PATH (pip install yt-dlp / winget install yt-dlp)");
  if (needsFfmpeg && !hasTool("ffmpeg", "-version")) fail("ffmpeg not found on PATH (winget install ffmpeg / brew install ffmpeg)");

  const runTimestamp = new Date().toISOString();
  const normalize = options.verifyEndpoint ? loadNormalizer(options.language) : null;
  const summaries = [];
  const corpusRows = [];
  const valRows = [];
  const rejectedRows = [];

  for (let i = 0; i < sources.length; i++) {
    const input = sources[i];
    console.log(`[${i + 1}/${sources.length}] ${input}`);
    let summary = { input };
    try {
      const source = isUrl(input) ? resolveUrlSource(input) : resolveLocalSource(input, sources.length);
      summary = { input, id: source.id, title: source.title, license: source.license, subtitleLang: source.subtitleLang };
      if (source.skipped) {
        summary.skipped = source.skipped;
        console.warn(`  SKIP: ${source.skipped}`);
      } else {
        const cues = parseSubtitles(readFileSync(source.subsPath, "utf8"));
        let mediaDurationSec = Infinity;
        if (!options.dryRun) {
          const audio = extractAudio(source);
          source.fullWav = audio.fullWav;
          mediaDurationSec = audio.duration;
        }
        const clips = planClips(cues, { ...options.planner, mediaDurationSec });
        const plannedSec = clips.reduce((acc, c) => acc + (c.end - c.start), 0);
        summary.stats = { cues: cues.length, clips: clips.length, plannedMinutes: Math.round(plannedSec / 6) / 10 };
        console.log(`  ${cues.length} cues → ${clips.length} clips (${summary.stats.plannedMinutes} min)`);

        if (!options.dryRun) {
          const { kept, rejected, verifyErrors } = await cutAndVerify(source, clips, normalize, runTimestamp);
          const isVal =
            options.valPct > 0 &&
            parseInt(createHash("sha256").update(source.id).digest("hex"), 16) % VAL_HASH_BUCKETS < options.valPct;
          (isVal ? valRows : corpusRows).push(...kept);
          rejectedRows.push(...rejected);
          summary.stats = { ...summary.stats, kept: kept.length, verifyRejected: rejected.length, verifyErrors, split: isVal ? "val" : "train" };
          if (options.verifyEndpoint) console.log(`  verify: ${kept.length} kept, ${rejected.length} rejected, ${verifyErrors} errors`);
        }
      }
    } catch (err) {
      summary.skipped = String(err.message ?? err);
      console.warn(`  FAILED: ${summary.skipped}`);
    }
    summaries.push(summary);
  }

  const ingested = summaries.filter((s) => !s.skipped);
  if (options.dryRun) {
    console.log(`\nDry run: ${ingested.length}/${sources.length} sources ingestible — nothing written.`);
    return;
  }
  if (ingested.length === 0) {
    console.error("\nNo sources could be ingested.");
    process.exit(1);
  }

  mkdirSync(options.outDir, { recursive: true });
  const toJsonl = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  writeFileSync(join(options.outDir, "corpus.jsonl"), toJsonl(corpusRows));
  if (options.valPct > 0) writeFileSync(join(options.outDir, "val.jsonl"), toJsonl(valRows));
  writeFileSync(join(options.outDir, "rejected.jsonl"), toJsonl(rejectedRows));
  writeFileSync(
    join(options.outDir, "manifest.json"),
    JSON.stringify({ created_at: runTimestamp, language: options.language, options: { ...options, planner: options.planner }, sources: summaries }, null, 2)
  );

  const totalSec = [...corpusRows, ...valRows].reduce((acc, r) => acc + (r.end - r.start), 0);
  console.log(`\nWrote ${corpusRows.length} train rows${options.valPct > 0 ? ` + ${valRows.length} val rows` : ""} (${(totalSec / 60).toFixed(1)} min audio), ${rejectedRows.length} rejected → ${options.outDir}`);
  console.log("Merge into training data by concatenating corpus.jsonl onto prepare_data.py's train.jsonl (see README).");
}

await main();
