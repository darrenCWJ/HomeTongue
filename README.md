# HomeTongue 粵

**Learn to speak your family's dialect.** HomeTongue is a mobile-first web app (with a Capacitor Android build) for reconnecting with heritage languages — starting with Cantonese. Speak or type English, hear natural Cantonese back in three tones of formality, save phrases, and turn real conversations into personalized lessons with speaking exams.

## Features

- 🎙️ **Live translation chat** — speak English (or Cantonese), get Traditional-Chinese text, Jyutping romanization, and studio-quality speech (Google Chirp 3 HD, 30 voices)
- 💬 **AI reply suggestions** tuned to your persona (personal vs. work) and tone (formal / casual / slang)
- 📚 **Lessons** — structured beginner content plus *conversation lessons* generated from your own chat history
- 🧠 **Speaking exams** — record yourself, get transcribed, and receive a lenient dialect-aware accuracy score
- 🔖 **Bookmarks & tags** — organize phrases and sessions
- 👤 **Personas** — the app learns your communication style and adapts suggestions
- 📱 **Android app** via Capacitor (iOS planned)

## Tech stack

React 18 + TypeScript (strict) · Vite 6 · Tailwind CSS v4 · Dexie (IndexedDB) · Vercel serverless functions (`api/`) · Capacitor 8 · OpenAI (chat + speech-to-text) · Google Cloud Text-to-Speech (Chirp 3 HD, `yue-HK`)

All AI provider keys live **server-side only** — the client talks to `/api/chat`, `/api/transcribe`, and `/api/tts`.

## Getting started

```bash
pnpm install
cp .env.example .env       # fill in OPENAI_API_KEY and GOOGLE_API_JSON
pnpm dev                   # http://localhost:5173 — /api/* served by dev middleware
```

Without keys the app still runs: translation falls back to a small offline mock, and TTS/STT show friendly errors.

### Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | dev server with `/api/*` middleware |
| `pnpm build` | production build to `dist/` |
| `pnpm typecheck` | strict TypeScript check (must be 0 errors) |
| `pnpm generate:previews` | pre-render voice preview MP3s to `public/voice-previews/` |
| `pnpm android:sync` | build web assets + sync the Capacitor Android project |

### Deploying to Vercel

1. Import the repo; framework preset **Vite** (`vercel.json` already sets build/output and security headers).
2. Set env vars: `OPENAI_API_KEY`, `GOOGLE_API_JSON` (single-line service-account JSON), optionally `OPENAI_MODEL`, `VITE_ACCESS_CODE`.
3. Deploy — the `api/` folder becomes serverless functions automatically.

### Android build

```bash
pnpm android:sync
npx cap open android       # then run from Android Studio
```

Native builds **must** set `VITE_API_BASE_URL` (e.g. `https://your-app.vercel.app`) at build time so the webview can reach the API. See `docs/MOBILE.md`.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the pieces fit together
- [`docs/SETUP.md`](docs/SETUP.md) — environment, keys, and provider setup in detail
- [`docs/MOBILE.md`](docs/MOBILE.md) — Capacitor Android (and future iOS) guide
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — domain types and persistence schema
- [`docs/IMPROVEMENT_PLAN.md`](docs/IMPROVEMENT_PLAN.md) — phased roadmap: real auth, cloud DB, multi-language, ML data pipeline
- [`CLAUDE.md`](CLAUDE.md) — working conventions for AI-assisted development

## Security notes

- The access-code screen is a **soft gate**, not authentication — real accounts arrive in Phase 3 of the improvement plan.
- Never put a secret in a `VITE_`-prefixed env var; Vite embeds those in the public bundle.
- `api/*` functions validate input and rate-limit per IP (best-effort; durable limiting is on the roadmap).

## Status

Hackathon project under active rebuild. Cantonese is live; Hokkien, Hakka, and Teochew are planned via the language-pack architecture (see the improvement plan).
