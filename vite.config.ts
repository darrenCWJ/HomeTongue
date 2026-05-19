import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createSign } from 'crypto'
import type { IncomingMessage, ServerResponse } from 'http'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize'
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform'

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

function ttsDevMiddleware(saJson: string | undefined) {
  return {
    name: 'tts-dev-middleware',
    configureServer(server: { middlewares: { use(path: string, handler: (req: IncomingMessage, res: ServerResponse) => void): void } }) {
      server.middlewares.use('/api/tts', async (req: IncomingMessage, res: ServerResponse) => {
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
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { text?: string; voiceName?: string; languageCode?: string }
          if (!saJson) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: 'VITE_GOOGLE_API_JSON not configured' }))
            return
          }
          const sa = JSON.parse(saJson) as { private_key: string; client_email: string }
          const { text, voiceName, languageCode } = body
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
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
        }
      })
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
      ttsDevMiddleware(env.VITE_GOOGLE_API_JSON),
      // The React and Tailwind plugins are both required for Make, even if
      // Tailwind is not being actively used – do not remove them
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        // Alias @ to the src directory
        '@': path.resolve(__dirname, './src'),
      },
    },
    // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
    assetsInclude: ['**/*.svg', '**/*.csv'],
  }
})
