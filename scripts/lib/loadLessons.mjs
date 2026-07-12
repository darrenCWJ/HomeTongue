// Loads the app's REAL lesson registry (src/data/lessons.ts) from a plain
// Node script by bundling it with esbuild first — Node can't import the
// app's extensionless-TS modules directly. Same pattern as
// ml/eval/build-normalization.mjs.

import { build } from "esbuild";
import { rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

/**
 * Bundle and import the lesson registry.
 *
 * @returns {Promise<{ getLessonContent: (code: string) => { categories: Array<object>, lessons: Array<object> } }>}
 */
export async function loadLessonRegistry() {
  const bundled = join(here, ".lessons-bundle.mjs");
  await build({
    stdin: {
      contents: 'export { getLessonContent } from "./src/data/lessons";',
      resolveDir: repoRoot,
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "neutral",
    outfile: bundled,
    logLevel: "silent",
  });
  try {
    // Cache-bust so repeated loads within one process see fresh content.
    return await import(`${pathToFileURL(bundled).href}?t=${Date.now()}`);
  } finally {
    rmSync(bundled, { force: true });
  }
}
