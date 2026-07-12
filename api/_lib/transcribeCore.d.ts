export interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}

export function transcribeCore(
  body: unknown,
  env: Record<string, string | undefined>
): Promise<HandlerResult>;
