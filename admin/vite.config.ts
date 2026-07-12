import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standalone admin app — separate from the main HomeTongue bundle so that
// admin-only code never ships to end users.

// The Content page reuses the pure, browser-safe lesson-CSV core that also
// powers the CLI pipeline (scripts/lib/lessonCsv.mjs) instead of duplicating
// its validation logic. The alias gives that out-of-root import a stable,
// typable name (declared in src/lib/lesson-csv.d.ts).
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const lessonCsvCore = fileURLToPath(new URL("../scripts/lib/lessonCsv.mjs", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@lesson-csv": lessonCsvCore },
  },
  server: {
    // The dev server must be allowed to serve scripts/lib and api/_lib
    // (lessonSchema.mjs imports the language manifest) from outside admin/.
    // The production build resolves these at bundle time regardless.
    fs: { allow: [repoRoot] },
  },
});
