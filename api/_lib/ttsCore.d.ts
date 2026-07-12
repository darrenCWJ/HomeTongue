export interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Documented shape of the /api/tts request body. The core still receives
 * `unknown` and validates at runtime; this type exists for client/test
 * reference.
 */
export interface TtsRequestBody {
  text: string;
  voiceName: string;
  languageCode: string;
  /** Optional playback speed (1 = normal), validated to [0.5, 1.2]. */
  speakingRate?: number;
}

export function ttsCore(body: unknown, env: Record<string, string | undefined>): Promise<HandlerResult>;
