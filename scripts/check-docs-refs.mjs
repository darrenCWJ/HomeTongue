// Fails when a docs/ markdown link points at a repo file that does not exist,
// or at a line number beyond that file's length. Keeps the file:line claims in
// the ML/architecture docs honest as code moves. Stdlib only.
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, resolve, dirname, relative } from "path";

const DOCS_ROOT = "docs";
// [text](target) and [text](target:123) — captures target and optional line.
const LINK_RE = /\[[^\]]*\]\(([^)\s]+?)(?::(\d+))?\)/g;
const EXTERNAL_RE = /^(https?:|mailto:|#|data:)/;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

const offenders = [];
for (const file of walk(DOCS_ROOT)) {
  if (!file.endsWith(".md")) continue;
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(LINK_RE)) {
    const [, target, lineStr] = match;
    if (EXTERNAL_RE.test(target)) continue;
    const abs = resolve(dirname(file), decodeURI(target));
    if (!existsSync(abs)) {
      offenders.push(`${file}: missing target "${target}"`);
      continue;
    }
    if (!lineStr) continue;
    const lineCount = readFileSync(abs, "utf8").split("\n").length;
    const wanted = Number(lineStr);
    if (wanted > lineCount) {
      offenders.push(
        `${file}: "${target}:${wanted}" exceeds ${relative(".", abs)} (${lineCount} lines)`
      );
    }
  }
}

if (offenders.length > 0) {
  console.error("Broken documentation references:");
  for (const line of offenders) console.error(`  ${line}`);
  process.exit(1);
}
console.log("Documentation reference check passed.");
