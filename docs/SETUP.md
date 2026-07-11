# Setup

## Prerequisites

- Node 20+ (Node 24 recommended), pnpm 10+
- An OpenAI API key (translation, suggestions, personas, speech-to-text)
- A Google Cloud service account with the **Cloud Text-to-Speech API** enabled (Chirp 3 HD voices)
- (Android builds) Android Studio + JDK 17+

## Local development

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Fill `.env`:

| Variable | Required | Notes |
|---|---|---|
| `OPENAI_API_KEY` | for AI features | server-side only; read by dev middleware + Vercel functions |
| `OPENAI_MODEL` | no | default `gpt-4o-mini` |
| `GOOGLE_API_JSON` | for TTS | the **entire** service-account JSON as a single line. In Vercel, paste it as-is into one env var; `\n` inside `private_key` is normalized automatically. |
| `VITE_ACCESS_CODE` | no | enables the entry gate. This value ships in the JS bundle — treat it as a courtesy gate, not security. |
| `VITE_STORAGE_MODE` | no | `local` (default). `cloud` is a non-functional stub. |
| `VITE_API_BASE_URL` | native builds only | deployed origin for `/api/*`; leave unset for web |

Missing keys degrade gracefully: translation uses a small offline mock; TTS/STT surface toasts.

### Google service account, step by step

1. Google Cloud Console → create/select project → enable **Cloud Text-to-Speech API**.
2. IAM → Service Accounts → create (no special roles needed for TTS synth) → Keys → add JSON key.
3. Collapse the downloaded JSON to one line (e.g. `jq -c . key.json`) and set it as `GOOGLE_API_JSON`.

### Voice previews (optional, saves TTS cost)

`pnpm generate:previews` renders one MP3 per voice into `public/voice-previews/` so the voice picker plays static files instead of calling the API. Requires `GOOGLE_API_JSON` locally.

## Vercel deployment

1. Import the repo into Vercel (preset: Vite). `vercel.json` supplies build command, SPA rewrite, and security headers (CSP, HSTS, etc.).
2. Project → Settings → Environment Variables: add `OPENAI_API_KEY`, `GOOGLE_API_JSON`, optionally `OPENAI_MODEL` and `VITE_ACCESS_CODE`.
3. The `api/` directory deploys as serverless functions automatically. No extra config.

### Key rotation

If a key has ever been exposed (e.g. it shipped in a client bundle before the proxy migration), rotate it at the provider and update the Vercel env var. The client never needs redeploying for server-side key changes.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Translation service is not configured" toast | `OPENAI_API_KEY` missing in `.env` (dev) or Vercel env (prod) |
| TTS 500 "not configured" | `GOOGLE_API_JSON` missing or not valid single-line JSON |
| TTS 400 "Unsupported voice" | voice name outside the `yue-HK-Chirp3-HD-*` allowlist in `api/tts.js` |
| 429 responses | per-IP rate limit hit (see `api/*.js` constants) |
| Native app: every AI call fails | `VITE_API_BASE_URL` wasn't set at build time |
| Mic does nothing on second tap after denying permission | fixed in the overhaul — update your build |
