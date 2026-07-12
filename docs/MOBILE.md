# Mobile (Capacitor)

Both native apps wrap the built web bundle (`dist/`) in a Capacitor 8 webview.

**Current state**

| Platform | Status |
|---|---|
| Android (`android/`) | Ready to run — sync builds cleanly, icons/splash generated, manifest hardened. Needs a keystore for store signing. |
| iOS (`ios/`) | Scaffolded (SPM-based, no CocoaPods) with mic permission + icons/splash in place. Building/archiving **requires a Mac** (Xcode) or the Codemagic workflow in `codemagic.yaml`. |

## Config

- `capacitor.config.ts` — `appId: com.hometongue.app`, `appName: HomeTongue`, `webDir: dist`, `androidScheme: https` (the appId flows into both native projects).
- `android/` — Gradle project. `android/local.properties` and build outputs are gitignored.
- `ios/` — Xcode project using Swift Package Manager (`ios/App/CapApp-SPM`); Capacitor 8 does not use CocoaPods, so there is no `pod install` step. Generated `ios/App/App/public` web assets are gitignored.

## `VITE_API_BASE_URL` is REQUIRED for native builds

The webview has no origin, so relative `/api/*` calls fail. Bake the deployed API origin in at **web build time**:

```bash
VITE_API_BASE_URL=https://home-tongue.vercel.app pnpm build
```

`pnpm android:sync` runs `vite build` without the env var — export it first, or use the explicit command above followed by `npx cap sync <platform>`. The CI `android-build` job and `codemagic.yaml` both set it.

## Building the Android app

```bash
# 1. Build web assets with the API origin baked in
VITE_API_BASE_URL=https://home-tongue.vercel.app pnpm build

# 2. Sync into the native project
npx cap sync android

# 3. Open and run
npx cap open android
```

CI (`.github/workflows/ci.yml`, `android-build` job) produces an **unsigned release AAB** artifact on every push to `main`. Signing via secrets is stubbed in a commented step there.

**Version bumps per release**: edit `versionCode` (integer, must increase every Play upload) and `versionName` (display string) in `android/app/build.gradle` → `defaultConfig`.

## Building the iOS app

The scaffold is complete on any OS (`npx cap sync ios` works on Windows), but compiling requires Xcode:

- **On a Mac**: `npx cap open ios`, set your signing team in Xcode, run.
- **No Mac**: use `codemagic.yaml` — a Codemagic iOS workflow with build steps wired and signing/publishing placeholders documented inline. It needs your Apple Developer account connected to Codemagic before it can produce an IPA.

Version bumps: `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in `ios/App/App.xcodeproj` (Xcode → App target → General).

WKWebView notes: a user gesture is required before `AudioContext` produces sound; MediaRecorder needs iOS 14.3+; `NSMicrophoneUsageDescription` is already set in `ios/App/App/Info.plist`.

## Icons & splash screens

Generated from `public/logo.png` into both native projects:

```bash
node scripts/generate-app-assets.mjs          # compose sources into assets/
npx capacitor-assets generate --android --ios # fan out into android/ + ios/
```

Re-run both whenever the logo changes. Sources live in `assets/` (icon, adaptive foreground/background, splash + splash-dark); the generated native files are committed. See the script header for sizing/crop rationale.

## How native differs from web

| Concern | Web | Native |
|---|---|---|
| `/api/*` calls | same origin (Vercel) | must target `VITE_API_BASE_URL` (see `src/lib/api.ts`) |
| CSP | HTTP headers from `vercel.json` | headers don't apply to bundled files — a `<meta>` CSP for the webview is roadmap work |
| Cleartext HTTP | n/a (HTTPS origin) | blocked by `res/xml/network_security_config.xml` (`cleartextTrafficPermitted="false"`) |
| Mic permission | browser prompt | `RECORD_AUDIO` runtime permission (Android manifest) / `NSMicrophoneUsageDescription` (iOS) |
| Backup | n/a | `android:allowBackup="false"` — chat history/persona data stays on-device |
| Analytics | Vercel Web Analytics (cookieless) | none — `src/main.tsx` skips injection when `window.Capacitor` exists |

## Permissions declared

- **Android**: `INTERNET`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` — nothing else. Keep it that way.
- **iOS**: `NSMicrophoneUsageDescription` only.

## Store-readiness checklists

Both stores require a hosted privacy policy: **https://home-tongue.vercel.app/privacy.html** (source: [`docs/PRIVACY_POLICY.md`](PRIVACY_POLICY.md)).

### Google Play

- [x] Unsigned release AAB built by CI (`android-build` job)
- [x] App icon (adaptive) + splash (light/dark) generated
- [x] `allowBackup=false`, cleartext blocked, minimal permissions
- [x] Privacy policy URL live
- [ ] Create a Play Console app (`com.hometongue.app`) — needs the user's Play developer account ($25 one-time)
- [ ] Generate an upload keystore and wire `KEYSTORE_BASE64` / `KEYSTORE_PASSWORD` / `KEY_ALIAS` / `KEY_PASSWORD` secrets (commented step in `ci.yml`)
- [ ] Bump `versionCode`/`versionName` for each upload
- [ ] Data-safety form (mirror `docs/PRIVACY_POLICY.md`), content rating, store listing (screenshots, feature graphic)

### Apple App Store

- [x] iOS project scaffolded, mic usage description, icons/splash generated
- [x] Codemagic workflow skeleton (`codemagic.yaml`)
- [x] Privacy policy URL live
- [ ] Apple Developer Program membership ($99/yr) — required for any device install/distribution
- [ ] Register bundle id `com.hometongue.app` + App Store Connect app record
- [ ] Connect the repo + App Store Connect API key in Codemagic (or build on a Mac), then un-comment the signing/publishing blocks in `codemagic.yaml`
- [ ] App privacy questionnaire (mirror `docs/PRIVACY_POLICY.md`), screenshots, TestFlight review

## Device test checklist

- [ ] Mic record → transcribe → translate round trip (Chat)
- [ ] Deny mic permission once, then grant — buttons recover
- [ ] TTS playback (requires a user gesture to unlock audio on some devices)
- [ ] Exam mode record + scoring
- [ ] Safe-area insets on notched devices (bottom nav)
- [ ] Offline launch: app opens, saved data visible, AI features show friendly errors
