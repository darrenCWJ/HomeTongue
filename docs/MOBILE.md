# Mobile (Capacitor)

The Android app wraps the built web bundle (`dist/`) in a Capacitor 8 webview. iOS is planned (Phase 5 of the improvement plan).

## Config

- `capacitor.config.ts` — `appId: com.hometongue.app`, `appName: HomeTongue`, `webDir: dist`, `androidScheme: https`
- `android/` — the native project (Gradle). `android/local.properties` and build outputs are gitignored.

## Building the Android app

```bash
# 1. Build web assets with the API origin baked in (REQUIRED —
#    the webview has no origin, so relative /api/* calls fail)
VITE_API_BASE_URL=https://your-app.vercel.app pnpm build

# 2. Sync into the native project
npx cap sync android

# 3. Open and run
npx cap open android
```

(`pnpm android:sync` does steps 1–2 but without the env var — export `VITE_API_BASE_URL` first or use the explicit command above.)

## How native differs from web

| Concern | Web | Native |
|---|---|---|
| `/api/*` calls | same origin (Vercel) | must target `VITE_API_BASE_URL` (see `src/lib/api.ts`) |
| CSP | HTTP headers from `vercel.json` | headers don't apply to bundled files — a `<meta>` CSP for the webview is roadmap work |
| Cleartext HTTP | n/a (HTTPS origin) | blocked by `res/xml/network_security_config.xml` (`cleartextTrafficPermitted="false"`) |
| Mic permission | browser prompt | `RECORD_AUDIO` runtime permission (declared in `AndroidManifest.xml`) |
| Backup | n/a | `android:allowBackup="false"` — chat history/persona data stays on-device |

## Permissions declared

`INTERNET`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` — nothing else. Keep it that way.

## Device test checklist

- [ ] Mic record → transcribe → translate round trip (Chat)
- [ ] Deny mic permission once, then grant — buttons recover
- [ ] TTS playback (requires a user gesture to unlock audio on some devices)
- [ ] Exam mode record + scoring
- [ ] Safe-area insets on notched devices (bottom nav)
- [ ] Offline launch: app opens, saved data visible, AI features show friendly errors

## iOS (when started)

```bash
pnpm add @capacitor/ios && npx cap add ios
```

Watch for: WKWebView requires a user gesture before `AudioContext` produces sound; MediaRecorder support needs iOS 14.3+; add `NSMicrophoneUsageDescription` to Info.plist.
