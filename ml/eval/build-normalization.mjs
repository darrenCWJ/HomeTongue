// Regenerates normalization.json from the app's language pack.
// Run after changing src/languages/yue-HK scoring data:
//   node ml/eval/build-normalization.mjs
// A vitest test (tests/ml-normalization-sync.test.ts) fails CI if the
// committed JSON drifts from the pack.
import { build } from "esbuild";
import { writeFileSync, rmSync } from "fs";
import { pathToFileURL } from "url";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const bundled = join(here, ".pack-bundle.mjs");

await build({
  entryPoints: [join(here, "pack-entry.ts")],
  bundle: true,
  format: "esm",
  platform: "neutral",
  outfile: bundled,
  logLevel: "silent",
});

const { normalization } = await import(pathToFileURL(bundled).href);
writeFileSync(join(here, "normalization.json"), JSON.stringify(normalization, null, 2) + "\n");
rmSync(bundled);
console.log(
  `normalization.json written (${Object.keys(normalization.charEquivalents).length} char equivalents, ${normalization.particleGroups.length} particle groups)`
);
