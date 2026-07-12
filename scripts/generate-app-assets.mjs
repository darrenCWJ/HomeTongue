// Composes the @capacitor/assets source images in assets/ from public/logo.png,
// then you run `npx capacitor-assets generate` to fan them out into the native
// android/ and ios/ projects. Re-run both steps whenever the logo changes:
//
//   node scripts/generate-app-assets.mjs
//   npx capacitor-assets generate --android --ios
//
// (Scope to --android --ios: without flags the tool also emits PWA icons into
// icons/ plus a public/manifest.webmanifest, which this app doesn't use.)
//
// Outputs (the @capacitor/assets default source layout):
//   assets/icon.png             1024x1024  full-bleed icon (logo flattened onto its own yellow)
//   assets/icon-foreground.png  1024x1024  Android adaptive foreground (logo in the 66% safe zone)
//   assets/icon-background.png  1024x1024  Android adaptive background (solid brand yellow)
//   assets/splash.png           2732x2732  light splash (white background)
//   assets/splash-dark.png      2732x2732  dark splash (zinc-950 #09090b, --background in dark theme)
//
// sharp is a transitive dependency of @capacitor/assets — resolve it from
// there so we don't have to declare it ourselves (pnpm-workspace.yaml
// allowlists its native postinstall via onlyBuiltDependencies).
import { createRequire } from "module";
import { mkdir } from "fs/promises";

const require = createRequire(import.meta.url);
const assetsPkg = require.resolve("@capacitor/assets/package.json");
const sharp = createRequire(assetsPkg)("sharp");

const LOGO = "public/logo.png";
const OUT_DIR = "assets";

// Sampled from public/logo.png — the logo's own rounded-square fill.
const BRAND_YELLOW = { r: 255, g: 202, b: 54, alpha: 1 };
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
// zinc-950, the app's dark-mode --background (src/styles/theme.css).
const ZINC_950 = { r: 9, g: 9, b: 11, alpha: 1 };

const ICON_SIZE = 1024;
// Android adaptive icons mask to a central ~66% safe zone.
const ADAPTIVE_SAFE = Math.round(ICON_SIZE * 0.66);

const SPLASH_SIZE = 2732;
// @capacitor/assets cover-crops the 2732x2732 source from the center for each
// device resolution. On a 9:19.5 phone only ~2732 * (9 / 19.5) ≈ 1261px of the
// source width stays visible, so the logo must fit inside that band — ~45% of
// the canvas is the largest "60%-ish" size that never gets clipped.
const SPLASH_LOGO_WIDTH = Math.round(SPLASH_SIZE * 0.45);

async function canvas(size, background) {
  return sharp({ create: { width: size, height: size, channels: 4, background } });
}

async function composeCentered(size, background, logoWidth, file) {
  const logo = await sharp(LOGO).resize(logoWidth, logoWidth).toBuffer();
  const base = await canvas(size, background);
  await base
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(file);
  console.log("wrote", file);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  // Full-bleed icon: the logo flattened onto its own yellow so the
  // transparent rounded corners fill in.
  await composeCentered(ICON_SIZE, BRAND_YELLOW, ICON_SIZE, `${OUT_DIR}/icon.png`);

  // Adaptive foreground: logo shrunk into the safe zone on a transparent
  // canvas (its yellow rounded square merges into the background layer).
  await composeCentered(
    ICON_SIZE,
    { r: 0, g: 0, b: 0, alpha: 0 },
    ADAPTIVE_SAFE,
    `${OUT_DIR}/icon-foreground.png`
  );

  // Adaptive background: solid brand yellow.
  await (await canvas(ICON_SIZE, BRAND_YELLOW)).png().toFile(`${OUT_DIR}/icon-background.png`);
  console.log("wrote", `${OUT_DIR}/icon-background.png`);

  await composeCentered(SPLASH_SIZE, WHITE, SPLASH_LOGO_WIDTH, `${OUT_DIR}/splash.png`);
  await composeCentered(SPLASH_SIZE, ZINC_950, SPLASH_LOGO_WIDTH, `${OUT_DIR}/splash-dark.png`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
