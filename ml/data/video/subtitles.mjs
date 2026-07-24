// Subtitle parsing + clip planning for the drop-in video ingest tool
// (ml/data/video/ingest-videos.mjs). Pure functions, no I/O — unit-tested in
// tests/ml-video-ingest.test.js and usable in --dry-run mode without
// ffmpeg/yt-dlp installed.
//
// Supported formats: WebVTT (.vtt) and SubRip (.srt). All timestamps are
// float seconds.

/** Parse "HH:MM:SS.mmm", "MM:SS.mmm" (VTT) or "HH:MM:SS,mmm" (SRT) to seconds. */
export function parseTimestamp(raw) {
  const m = raw.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/);
  if (!m) return null;
  const [, h, min, s, ms] = m;
  return Number(h ?? 0) * 3600 + Number(min) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;
}

const stripBom = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

/** "start --> end [settings]" → { start, end } | null. Cue settings are dropped. */
function parseTimingLine(line) {
  const parts = line.split("-->");
  if (parts.length !== 2) return null;
  const start = parseTimestamp(parts[0]);
  const end = parseTimestamp(parts[1].trim().split(/\s+/)[0] ?? "");
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

/** Parse WebVTT content into raw cues [{ start, end, text }]. */
export function parseVtt(content) {
  const lines = stripBom(content).split(/\r?\n/);
  const cues = [];
  let i = 0;
  if (lines[0]?.trim().startsWith("WEBVTT")) {
    i = 1;
    while (i < lines.length && lines[i].trim() !== "") i++; // header metadata block
  }
  while (i < lines.length) {
    let line = lines[i].trim();
    if (line === "") {
      i++;
      continue;
    }
    if (/^(NOTE|STYLE|REGION)(\s|$)/.test(line)) {
      while (i < lines.length && lines[i].trim() !== "") i++;
      continue;
    }
    if (!line.includes("-->")) {
      i++; // cue identifier line
      line = (lines[i] ?? "").trim();
    }
    const timing = parseTimingLine(line);
    i++;
    if (!timing) continue;
    const text = [];
    while (i < lines.length && lines[i].trim() !== "") {
      text.push(lines[i].trim());
      i++;
    }
    cues.push({ ...timing, text: text.join("\n") });
  }
  return cues;
}

/** Parse SubRip (.srt) content into raw cues [{ start, end, text }]. */
export function parseSrt(content) {
  const lines = stripBom(content).split(/\r?\n/);
  const cues = [];
  let i = 0;
  while (i < lines.length) {
    let line = lines[i].trim();
    if (line === "") {
      i++;
      continue;
    }
    if (/^\d+$/.test(line)) {
      i++; // block index line
      line = (lines[i] ?? "").trim();
    }
    const timing = parseTimingLine(line);
    i++;
    if (!timing) continue;
    const text = [];
    while (i < lines.length && lines[i].trim() !== "") {
      text.push(lines[i].trim());
      i++;
    }
    cues.push({ ...timing, text: text.join("\n") });
  }
  return cues;
}

/** Auto-detect VTT vs SRT by the WEBVTT header. */
export function parseSubtitles(content) {
  return stripBom(content).trimStart().startsWith("WEBVTT") ? parseVtt(content) : parseSrt(content);
}

/**
 * Clean one cue's text down to the words a speaker actually says.
 * Returns "" when the cue is not speech (music, sound descriptions).
 * Deliberately conservative: only clearly-non-speech markup is removed, and
 * CJK "speaker：" prefixes are LEFT ALONE (too risky to distinguish from
 * real speech containing a colon); only ALL-CAPS latin labels are stripped.
 */
export function cleanCueText(raw) {
  if (/[♪♫🎵]/.test(raw)) return ""; // music cue, not speech
  let text = raw
    .replace(/<[^>\n]*>/g, "") // VTT/HTML tags incl. <v Speaker>
    .replace(/\{\\[^}]*\}/g, "") // ASS/SSA override blocks like {\an8}
    .replace(/[[（(【][^\]）)】]*[\]）)】]/g, "") // sound descriptions: [laughs] （笑聲） 【門鈴】
    .replace(/\s+/g, " ")
    .trim();
  text = text.replace(/^[A-Z][A-Z0-9 ]{0,15}:\s*/, ""); // "MC: ..." style latin speaker label
  text = text.replace(/(^|\s)[-－—]+\s*/g, "$1"); // leading dialogue dashes
  return text.trim();
}

/** Join cue texts: space only between latin/digit boundaries, never inside CJK. */
const joinCueText = (a, b) => (/[A-Za-z0-9]$/.test(a) && /^[A-Za-z0-9]/.test(b) ? `${a} ${b}` : `${a}${b}`);

const round3 = (n) => Math.round(n * 1000) / 1000;

export const DEFAULT_PLANNER_OPTIONS = {
  /** Merge cues separated by at most this gap into one clip. */
  mergeGapSec: 0.4,
  /** Never grow a merged clip beyond this duration (Whisper trains on ≤30s). */
  maxClipSec: 15,
  /** Drop clips shorter than this — too little audio to carry the text. */
  minClipSec: 0.6,
  /** Drop clips whose cleaned text is shorter than this many characters. */
  minTextChars: 2,
  /** Widen each clip by this margin, clamped to its neighbours' true edges. */
  padSec: 0.15,
  /** Media length; tail padding is clamped to it. Infinity when unknown. */
  mediaDurationSec: Infinity,
};

/**
 * Turn raw cues into cut-ready clips [{ start, end, text, cueCount }]:
 * clean text (dropping non-speech cues), merge rolling duplicates, merge
 * adjacent cues within the gap threshold up to maxClipSec, then filter by
 * duration/text length and pad boundaries without touching neighbours.
 */
export function planClips(cues, options = {}) {
  const opts = { ...DEFAULT_PLANNER_OPTIONS, ...options };

  const cleaned = [];
  for (const cue of cues) {
    const text = cleanCueText(cue.text);
    if (text) cleaned.push({ start: cue.start, end: cue.end, text });
  }

  // Rolling captions repeat the same text across consecutive cues — extend
  // the first occurrence instead of duplicating the line in the corpus.
  const deduped = [];
  for (const cue of cleaned) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.text === cue.text && cue.start - prev.end <= opts.mergeGapSec) {
      deduped[deduped.length - 1] = { ...prev, end: Math.max(prev.end, cue.end) };
    } else {
      deduped.push({ ...cue });
    }
  }

  const merged = [];
  for (const cue of deduped) {
    const prev = merged[merged.length - 1];
    const gap = prev ? cue.start - prev.end : Infinity;
    if (prev && gap >= 0 && gap <= opts.mergeGapSec && cue.end - prev.start <= opts.maxClipSec) {
      merged[merged.length - 1] = {
        start: prev.start,
        end: cue.end,
        text: joinCueText(prev.text, cue.text),
        cueCount: prev.cueCount + 1,
      };
    } else {
      merged.push({ start: cue.start, end: cue.end, text: cue.text, cueCount: 1 });
    }
  }

  const clips = [];
  for (let i = 0; i < merged.length; i++) {
    const clip = merged[i];
    if (clip.end - clip.start < opts.minClipSec) continue;
    if ([...clip.text].length < opts.minTextChars) continue;
    // Pad within the free space around the clip. Neighbours' UNPADDED edges
    // are the clamp, so two kept clips can never overlap (gap > mergeGapSec
    // > 2×padSec always holds for adjacent kept clips).
    const prevEnd = i > 0 ? merged[i - 1].end : 0;
    const nextStart = i < merged.length - 1 ? merged[i + 1].start : opts.mediaDurationSec;
    const start = Math.max(0, prevEnd, clip.start - opts.padSec);
    const end = Math.min(opts.mediaDurationSec, nextStart, clip.end + opts.padSec);
    if (end - start < opts.minClipSec) continue;
    clips.push({ start: round3(start), end: round3(end), text: clip.text, cueCount: clip.cueCount });
  }
  return clips;
}
