import { defineConfig, loadEnv } from "vite";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "http";
import { chatCore } from "./api/_lib/chatCore.js";
import { transcribeCore } from "./api/_lib/transcribeCore.js";
import { ttsCore } from "./api/_lib/ttsCore.js";

// ──────────────────────────────────────────────────────────
// Dev-only middleware that serves /api/* in `pnpm dev` by calling the SAME
// handler cores as the Vercel functions in api/ (validation, allowlists,
// size caps, upstream calls, timeouts, error mapping). Only per-IP rate
// limiting stays production-only (api/*.js adapters).
// ──────────────────────────────────────────────────────────

type HandlerCore = (
  body: unknown,
  env: Record<string, string | undefined>
) => Promise<{ status: number; body: Record<string, unknown> }>;

function coreEndpoint(core: HandlerCore, env: Record<string, string>) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Content-Type", "application/json");
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    let body: unknown;
    try {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      await new Promise<void>((resolve) => req.on("end", resolve));
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }
    try {
      const result = await core(body, env);
      res.statusCode = result.status;
      res.end(JSON.stringify(result.body));
    } catch (err) {
      console.error("[dev-api] error:", err);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  };
}

function devApiMiddleware(env: Record<string, string>) {
  return {
    name: "dev-api-middleware",
    configureServer(server: {
      middlewares: { use(path: string, handler: (req: IncomingMessage, res: ServerResponse) => void): void };
    }) {
      server.middlewares.use("/api/tts", coreEndpoint(ttsCore, env));
      server.middlewares.use("/api/chat", coreEndpoint(chatCore, env));
      server.middlewares.use("/api/transcribe", coreEndpoint(transcribeCore, env));
    },
  };
}

function figmaAssetResolver() {
  return {
    name: "figma-asset-resolver",
    resolveId(id: string) {
      if (id.startsWith("figma:asset/")) {
        const filename = id.replace("figma:asset/", "");
        return path.resolve(__dirname, "src/assets", filename);
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    base: "/",
    plugins: [figmaAssetResolver(), devApiMiddleware(env), react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
    assetsInclude: ["**/*.svg", "**/*.csv"],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom", "react-router"],
            motion: ["motion"],
          },
        },
      },
    },
  };
});
