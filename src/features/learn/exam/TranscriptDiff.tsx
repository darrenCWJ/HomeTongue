const PUNCT = /[，。！？、；：""''（）\s!?.,;:'"…—–]/;

/**
 * Renders the transcribed attempt with per-character match colouring against
 * the expected phrase. Uses LCS alignment so a missing/extra character does
 * not shift every subsequent match. Extracted from ExamView.
 */
export function TranscriptDiff({ expected, transcribed }: { expected: string; transcribed: string }) {
  const expectedClean = [...expected].filter((c) => !PUNCT.test(c));
  const transcribedFull = [...transcribed];
  const transcribedClean = transcribedFull.filter((c) => !PUNCT.test(c));

  const m = expectedClean.length;
  const n = transcribedClean.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let r = 1; r <= m; r++) {
    for (let c = 1; c <= n; c++) {
      dp[r][c] =
        expectedClean[r - 1] === transcribedClean[c - 1]
          ? dp[r - 1][c - 1] + 1
          : Math.max(dp[r - 1][c], dp[r][c - 1]);
    }
  }

  const matched = new Set<number>();
  let r = m;
  let c = n;
  while (r > 0 && c > 0) {
    if (expectedClean[r - 1] === transcribedClean[c - 1]) {
      matched.add(c - 1);
      r--;
      c--;
    } else if (dp[r - 1][c] >= dp[r][c - 1]) {
      r--;
    } else {
      c--;
    }
  }

  let cleanPos = 0;
  return (
    <>
      {transcribedFull.map((char, ci) => {
        if (PUNCT.test(char)) {
          return (
            <span key={ci} className="text-foreground/90">
              {char}
            </span>
          );
        }
        const isMatch = matched.has(cleanPos++);
        return (
          <span key={ci} className={isMatch ? "text-green-600" : "text-orange-600"}>
            {char}
          </span>
        );
      })}
    </>
  );
}
