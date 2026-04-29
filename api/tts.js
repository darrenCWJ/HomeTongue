const crypto = require("crypto");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TTS_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";

function base64url(str) {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function getAccessToken(privateKey, clientEmail) {
  const now = Math.floor(Date.now() / 1000);
  const signingInput = [
    base64url(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    base64url(JSON.stringify({ iss: clientEmail, scope: SCOPE, aud: TOKEN_URL, exp: now + 3600, iat: now })),
  ].join(".");

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signingInput);
  const sig = sign.sign(privateKey, "base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${signingInput}.${sig}`,
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const saJson = process.env.VITE_GOOGLE_API_JSON;
  if (!saJson) return res.status(500).json({ error: "VITE_GOOGLE_API_JSON not configured" });

  let sa;
  try {
    sa = JSON.parse(saJson);
  } catch {
    return res.status(500).json({ error: "VITE_GOOGLE_API_JSON is not valid JSON" });
  }

  const { text, voiceName, languageCode } = req.body || {};
  if (!text || !voiceName || !languageCode) {
    return res.status(400).json({ error: "Missing required fields: text, voiceName, languageCode" });
  }

  try {
    const token = await getAccessToken(sa.private_key, sa.client_email);

    const ttsRes = await fetch(TTS_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode, name: voiceName },
        audioConfig: { audioEncoding: "MP3" },
      }),
    });

    if (!ttsRes.ok) return res.status(ttsRes.status).json({ error: await ttsRes.text() });

    const data = await ttsRes.json();
    return res.status(200).json({ audioContent: data.audioContent });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
};
