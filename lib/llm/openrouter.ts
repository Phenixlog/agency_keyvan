/**
 * Minimal OpenRouter client (chat completions, strict JSON output).
 * Server-only: reads OPENROUTER_API_KEY. No local imports so it stays unit-testable.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 45_000;

/** Deep reasoning on a brand: run once per onboarding / explicit rebuild. */
export const MODEL_ANALYSIS =
  process.env.OPENROUTER_MODEL_ANALYSIS || "anthropic/claude-sonnet-5";
/** Short rewrites and prompt composition: run on every generation. */
export const MODEL_FAST =
  process.env.OPENROUTER_MODEL_FAST || "google/gemini-3.8-flash";

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmError";
  }
}

export function isLlmConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

type JsonSchema = Record<string, unknown>;

export async function chatJson<T>(args: {
  model: string;
  system: string;
  user: string;
  schemaName: string;
  schema: JsonSchema;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<T> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new LlmError("OPENROUTER_API_KEY manquante");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    signal: AbortSignal.timeout(args.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "http://localhost:3000",
      "X-Title": "Brand OS",
    },
    body: JSON.stringify({
      model: args.model,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      max_tokens: args.maxTokens ?? 2000,
      temperature: args.temperature ?? 0.4,
      response_format: {
        type: "json_schema",
        json_schema: { name: args.schemaName, strict: true, schema: args.schema },
      },
    }),
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new LlmError(`OpenRouter ${res.status}: ${detail}`);
  }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (body.error?.message) throw new LlmError(`OpenRouter: ${body.error.message}`);

  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new LlmError("Réponse vide du modèle");
  try {
    return JSON.parse(extractJson(content)) as T;
  } catch {
    throw new LlmError("Réponse du modèle non JSON");
  }
}

/** Some providers wrap JSON in a markdown fence despite response_format. */
export function extractJson(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : content).trim();
}
