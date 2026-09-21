/**
 * Minimal OpenRouter client (chat completions, strict JSON output).
 * Server-only: reads OPENROUTER_API_KEY. No local imports so it stays unit-testable.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 45_000;
/**
 * Reasoning models (Gemini Flash among them, where it cannot be disabled) spend part of
 * max_tokens thinking before they write. Without headroom a 400-token budget is consumed
 * entirely by reasoning and the answer comes back empty with finish_reason "length".
 * max_tokens is a ceiling, not a cost: unused headroom is free.
 */
const REASONING_HEADROOM_TOKENS = 2_000;

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

type ChatJsonArgs = {
  model: string;
  system: string;
  user: string;
  schemaName: string;
  schema: JsonSchema;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
};

const RETRYABLE = /non JSON|tronquée|vide/;
/** Passing refusals from the gateway (rate or admission control, upstream hiccup): worth one retry after a pause. */
const TRANSIENT = /^OpenRouter (429|502|503|504):/;
const TRANSIENT_PAUSE_MS = 1500;

/**
 * Model output is not deterministic: a malformed or truncated answer gets one second chance.
 * So does a transient gateway refusal, after a short pause.
 */
export async function chatJson<T>(args: ChatJsonArgs): Promise<T> {
  try {
    return await chatJsonOnce<T>(args);
  } catch (e) {
    if (!(e instanceof LlmError)) throw e;
    if (TRANSIENT.test(e.message)) {
      await new Promise((resolve) => setTimeout(resolve, TRANSIENT_PAUSE_MS));
      return chatJsonOnce<T>(args);
    }
    if (RETRYABLE.test(e.message)) return chatJsonOnce<T>(args);
    throw e;
  }
}

async function chatJsonOnce<T>(args: ChatJsonArgs): Promise<T> {
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
      max_tokens: (args.maxTokens ?? 2000) + REASONING_HEADROOM_TOKENS,
      // Structured extraction and short rewrites do not need long deliberation.
      reasoning: { effort: "low" },
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
    choices?: { finish_reason?: string; message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (body.error?.message) throw new LlmError(`OpenRouter: ${body.error.message}`);

  const choice = body.choices?.[0];
  if (choice?.finish_reason === "length") {
    throw new LlmError("Réponse tronquée : budget de tokens épuisé (réflexion du modèle comprise)");
  }
  const content = choice?.message?.content;
  if (!content) throw new LlmError("Réponse vide du modèle");
  try {
    return JSON.parse(extractJson(content)) as T;
  } catch {
    throw new LlmError("Réponse du modèle non JSON");
  }
}

/** Providers sometimes wrap the JSON in a markdown fence or add a sentence around it. */
export function extractJson(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced ? fenced[1] : content).trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}
