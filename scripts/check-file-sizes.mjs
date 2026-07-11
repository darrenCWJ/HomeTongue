// Fails CI when any source file exceeds the hard line cap (see CLAUDE.md).
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const MAX_LINES = 800;
const ROOTS = ["src", "api"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js"]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

const offenders = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (![...EXTENSIONS].some((ext) => file.endsWith(ext))) continue;
    const lines = readFileSync(file, "utf8").split("\n").length;
    if (lines > MAX_LINES) offenders.push({ file, lines });
  }
}

if (offenders.length > 0) {
  console.error(`Files exceeding the ${MAX_LINES}-line cap:`);
  for (const { file, lines } of offenders) console.error(`  ${file}: ${lines} lines`);
  process.exit(1);
}
console.log(`File size check passed (no file over ${MAX_LINES} lines).`);
