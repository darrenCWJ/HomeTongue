// @vitest-environment node
import { describe, test, expect } from "vitest";
import { readFileSync } from "fs";
import {
  parseTimestamp,
  parseVtt,
  parseSrt,
  parseSubtitles,
  cleanCueText,
  planClips,
} from "../ml/data/video/subtitles.mjs";
import { verifyOutcome } from "../ml/data/video/verify.mjs";

const fixture = readFileSync("ml/data/video/fixtures/sample.vtt", "utf8");

describe("parseTimestamp", () => {
  test("parses VTT and SRT timestamp styles to seconds", () => {
    expect(parseTimestamp("00:01:02.500")).toBe(62.5);
    expect(parseTimestamp("01:02.500")).toBe(62.5);
    expect(parseTimestamp("00:01:02,500")).toBe(62.5);
    expect(parseTimestamp("02:00:00.000")).toBe(7200);
  });

  test("rejects malformed timestamps", () => {
    expect(parseTimestamp("1.5s")).toBeNull();
    expect(parseTimestamp("")).toBeNull();
  });
});

describe("parseVtt", () => {
  test("parses cues, skipping header metadata, NOTE blocks, ids, and cue settings", () => {
    const cues = parseVtt(fixture);
    expect(cues).toHaveLength(9);
    expect(cues[0]).toEqual({ start: 1, end: 2.2, text: "<v 阿嫲><i>你食咗飯未呀？</i></v>" });
    expect(cues[8].text).toBe("MC: Welcome back to the show");
  });
});

describe("parseVtt malformed input", () => {
  test("a malformed timing line loses only its own cue, never the next one", () => {
    const vtt = [
      "WEBVTT",
      "",
      "00:00:05.000 --> 00:00:05.000", // zero-duration → rejected
      "orphaned text of the bad cue",
      "",
      "00:00:06.000 --> 00:00:07.000",
      "world",
      "",
    ].join("\n");
    expect(parseVtt(vtt)).toEqual([{ start: 6, end: 7, text: "world" }]);
  });
});

describe("parseSrt", () => {
  test("parses indexed blocks with comma milliseconds and multi-line text", () => {
    const srt = ["1", "00:00:01,000 --> 00:00:02,000", "first line", "second line", "", "2", "00:00:03,000 --> 00:00:04,500", "next cue", ""].join("\n");
    const cues = parseSrt(srt);
    expect(cues).toEqual([
      { start: 1, end: 2, text: "first line\nsecond line" },
      { start: 3, end: 4.5, text: "next cue" },
    ]);
  });
});

describe("parseSubtitles", () => {
  test("auto-detects format by the WEBVTT header", () => {
    expect(parseSubtitles(fixture)).toHaveLength(9);
    expect(parseSubtitles("1\n00:00:01,000 --> 00:00:02,000\nhello\n")).toEqual([{ start: 1, end: 2, text: "hello" }]);
  });
});

describe("cleanCueText", () => {
  test("strips markup tags and ASS overrides", () => {
    expect(cleanCueText("<v 阿嫲><i>你好</i></v>")).toBe("你好");
    expect(cleanCueText("{\\an8}字幕在上面")).toBe("字幕在上面");
  });

  test("removes sound descriptions in ASCII and fullwidth brackets", () => {
    expect(cleanCueText("[laughs] okay then")).toBe("okay then");
    expect(cleanCueText("（笑聲）唔好意思")).toBe("唔好意思");
    expect(cleanCueText("【門鈴聲】")).toBe("");
  });

  test("drops music cues entirely", () => {
    expect(cleanCueText("♪ 主題曲 ♪")).toBe("");
  });

  test("strips ALL-CAPS latin speaker labels but leaves CJK colons alone", () => {
    expect(cleanCueText("MC: Welcome back")).toBe("Welcome back");
    expect(cleanCueText("阿明：你好")).toBe("阿明：你好");
  });

  test("strips leading dialogue dashes", () => {
    expect(cleanCueText("－你好 －食咗未")).toBe("你好 食咗未");
  });
});

describe("planClips", () => {
  test("plans the fixture into cleaned, merged, padded clips", () => {
    const clips = planClips(parseVtt(fixture));
    expect(clips).toHaveLength(3);

    // Rolling duplicate extended, then merged across the 0.2s gap; CJK joined without a space.
    expect(clips[0].text).toBe("你食咗飯未呀？我食咗喇，多謝關心");
    expect(clips[0].cueCount).toBe(2);
    expect(clips[0].start).toBeCloseTo(0.85, 3);
    expect(clips[0].end).toBeCloseTo(5.05, 3); // padded, clamped by the next cue's true edge

    expect(clips[1].text).toBe("今日天氣真係好熱");
    expect(clips[1].start).toBeCloseTo(7.05, 3);
    expect(clips[1].end).toBeCloseTo(9.65, 3);

    // 吓？ (0.3s) dropped below minClipSec; the latin label survives label-stripping.
    expect(clips[2].text).toBe("Welcome back to the show");
    expect(clips[2].start).toBeCloseTo(10.85, 3);
    expect(clips[2].end).toBeCloseTo(12.65, 3);
  });

  test("kept clips never overlap even after padding", () => {
    const clips = planClips(parseVtt(fixture));
    for (let i = 1; i < clips.length; i++) {
      expect(clips[i].start).toBeGreaterThanOrEqual(clips[i - 1].end);
    }
  });

  test("stops merging at maxClipSec", () => {
    const cues = [
      { start: 0, end: 8, text: "早晨呀" },
      { start: 8.1, end: 14, text: "食咗飯未" },
      { start: 14.1, end: 20, text: "一齊去飲茶" },
    ];
    const clips = planClips(cues, { maxClipSec: 15, padSec: 0 });
    expect(clips.map((c) => c.text)).toEqual(["早晨呀食咗飯未", "一齊去飲茶"]);
  });

  test("drops clips with too little text and clamps tail padding to media duration", () => {
    const cues = [
      { start: 0, end: 2, text: "喂" },
      { start: 3, end: 4.9, text: "聽日見啦" },
    ];
    const clips = planClips(cues, { mediaDurationSec: 5 });
    expect(clips).toHaveLength(1);
    expect(clips[0].text).toBe("聽日見啦");
    expect(clips[0].end).toBeCloseTo(5, 3);
  });

  test("clips split only by maxClipSec never overlap (halved-gap padding)", () => {
    // Continuous dialogue: 4.5s cues with 0.2s gaps. Merging is capped by
    // maxClipSec, so consecutive clips share gaps smaller than 2×padSec.
    const cues = Array.from({ length: 10 }, (_, i) => ({
      start: i * 4.7,
      end: i * 4.7 + 4.5,
      text: `第${i}句對白內容係咁樣`,
    }));
    const clips = planClips(cues);
    expect(clips.length).toBeGreaterThan(1);
    for (let i = 1; i < clips.length; i++) {
      expect(clips[i].start).toBeGreaterThanOrEqual(clips[i - 1].end);
    }
  });

  test("joins latin cue boundaries with a space", () => {
    const cues = [
      { start: 0, end: 2, text: "welcome back" },
      { start: 2.1, end: 4, text: "to the show" },
    ];
    expect(planClips(cues)[0].text).toBe("welcome back to the show");
  });
});

describe("verifyOutcome", () => {
  test("keeps unverified clips only when verification was not requested", () => {
    expect(verifyOutcome(null, 0.6)).toBe("kept");
    expect(verifyOutcome(undefined, 0.6)).toBe("kept");
  });

  test("gates on the CER budget when a score exists", () => {
    expect(verifyOutcome({ transcript: "你好", cer: 0 }, 0.6)).toBe("kept");
    expect(verifyOutcome({ transcript: "你好", cer: 0.6 }, 0.6)).toBe("kept");
    expect(verifyOutcome({ transcript: "亂講嘢", cer: 0.61 }, 0.6)).toBe("rejected");
  });

  test("fails closed on endpoint errors and unscorable references", () => {
    expect(verifyOutcome({ error: "transcribe 503: …" }, 0.6)).toBe("unscored");
    expect(verifyOutcome({ transcript: "…", cer: null }, 0.6)).toBe("unscored");
  });
});
