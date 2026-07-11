import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createSign } from 'crypto'
import type { IncomingMessage, ServerResponse } from 'http'

// ──────────────────────────────────────────────────────────
// Dev-only middleware that mirrors the Vercel functions in api/
// so `pnpm dev` behaves like the deployed app. Keep the logic
// in sync with api/tts.js, api/chat.js, and api/transcribe.js.
// ──────────────────────────────────────────────────────────

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize'
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform'
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'
const OPENAI_TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions'

function base64url(str: string): string {
  return Buffer.from(str, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function getGoogleAccessToken(rawPrivateKey: string, clientEmail: string): Promise<string> {
  const privateKey = rawPrivateKey.replace(/\\n/g, '\n')
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claimSet = base64url(JSON.stringify({ iss: clientEmail, scope: SCOPE, aud: TOKEN_URL, exp: now + 3600, iat: now }))
  const signingInput = `${header}.${claimSet}`
  const sign = createSign('RSA-SHA256')
  sign.update(signingInput)
  const sig = sign.sign(privateKey, 'base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${signingInput}.${sig}`,
  })
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`)
  const json = await res.json() as { access_token: string }
  return json.access_token
}

type JsonHandler = (body: Record<string, unknown>, res: ServerResponse) => Promise<void>

function jsonEndpoint(handler: JsonHandler) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Content-Type', 'application/json')
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end(JSON.stringify({ error: 'Method not allowed' }))
      return
    }
    try {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      await new Promise<void>((resolve) => req.on('end', resolve))
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
      await handler(body, res)
    } catch (err) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
    }
  }
}

function devApiMiddleware(env: Record<string, string>) {
  const saJson = env.GOOGLE_API_JSON ?? env.VITE_GOOGLE_API_JSON
  const openaiKey = env.OPENAI_API_KEY ?? env.VITE_OPENAI_API_KEY
  const openaiModel = env.OPENAI_MODEL ?? env.VITE_OPENAI_MODEL ?? 'gpt-4o-mini'

  return {
    name: 'dev-api-middleware',
    configureServer(server: { middlewares: { use(path: string, handler: (req: IncomingMessage, res: ServerResponse) => void): void } }) {
      server.middlewares.use('/api/tts', jsonEndpoint(async (body, res) => {
        if (!saJson) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'GOOGLE_API_JSON not configured' }))
          return
        }
        const sa = JSON.parse(saJson) as { private_key: string; client_email: string }
        const { text, voiceName, languageCode } = body as { text?: string; voiceName?: string; languageCode?: string }
        if (!text || !voiceName || !languageCode) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Missing required fields: text, voiceName, languageCode' }))
          return
        }
        const token = await getGoogleAccessToken(sa.private_key, sa.client_email)
        const ttsRes = await fetch(TTS_ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text },
            voice: { languageCode, name: voiceName },
            audioConfig: { audioEncoding: 'MP3' },
          }),
        })
        if (!ttsRes.ok) {
          res.statusCode = ttsRes.status
          res.end(JSON.stringify({ error: await ttsRes.text() }))
          return
        }
        const data = await ttsRes.json() as { audioContent: string }
        res.statusCode = 200
        res.end(JSON.stringify({ audioContent: data.audioContent }))
      }))

      server.middlewares.use('/api/chat', jsonEndpoint(async (body, res) => {
        if (!openaiKey) {
          res.statusCode = 503
          res.end(JSON.stringify({ error: 'Translation service is not configured' }))
          return
        }
        const { messages, temperature, max_tokens, response_format } = body as {
          messages?: unknown; temperature?: number; max_tokens?: number; response_format?: { type?: string }
        }
        if (!Array.isArray(messages) || messages.length === 0) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'messages must be a non-empty array' }))
          return
        }
        const upstream = await fetch(OPENAI_CHAT_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: openaiModel,
            messages,
            temperature: typeof temperature === 'number' ? temperature : 0.3,
            max_tokens: typeof max_tokens === 'number' ? Math.min(max_tokens, 2000) : 1000,
            ...(response_format?.type === 'json_object' ? { response_format: { type: 'json_object' } } : {}),
          }),
        })
        if (!upstream.ok) {
          res.statusCode = 502
          res.end(JSON.stringify({ error: `OpenAI error (${upstream.status}): ${await upstream.text()}` }))
          return
        }
        const data = await upstream.json() as { choices?: { message?: { content?: string } }[] }
        res.statusCode = 200
        res.end(JSON.stringify({ content: data.choices?.[0]?.message?.content ?? '' }))
      }))

      server.middlewares.use('/api/transcribe', jsonEndpoint(async (body, res) => {
        if (!openaiKey) {
          res.statusCode = 503
          res.end(JSON.stringify({ error: 'Transcription service is not configured' }))
          return
        }
        const { audio, model, language, prompt } = body as { audio?: string; model?: string; language?: string; prompt?: string }
        if (typeof audio !== 'string' || audio.length === 0) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Missing required field: audio (base64)' }))
          return
        }
        const audioBuffer = Buffer.from(audio, 'base64')
        const formData = new FormData()
        formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'recording.wav')
        formData.append('model', model ?? 'gpt-4o-transcribe')
        if (language) formData.append('language', language)
        if (prompt) formData.append('prompt', prompt)
        const upstream = await fetch(OPENAI_TRANSCRIBE_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${openaiKey}` },
          body: formData,
        })
        if (!upstream.ok) {
          res.statusCode = 502
          res.end(JSON.stringify({ error: `OpenAI error (${upstream.status}): ${await upstream.text()}` }))
          return
        }
        const data = await upstream.json() as { text?: string }
        res.statusCode = 200
        res.end(JSON.stringify({ text: typeof data.text === 'string' ? data.text.trim() : '' }))
      }))
    },
  }
}

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id: string) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: '/',
    plugins: [
      figmaAssetResolver(),
      devApiMiddleware(env),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
    assetsInclude: ['**/*.svg', '**/*.csv'],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router'],
            motion: ['motion'],
          },
        },
      },
    },
  }
})
