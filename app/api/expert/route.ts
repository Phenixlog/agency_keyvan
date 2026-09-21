import { NextResponse, type NextRequest } from "next/server";
import { listKeptOuts, toDay, upcomingEntries, CHANNELS } from "@/lib/calendar";
import { MAX_ANSWER_TOKENS, MAX_MESSAGE_CHARS, MODEL_CHAT, buildExpertSystem, sanitizeHistory, saveExchange } from "@/lib/expert";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 90_000;
const KEPT_BRIEFS = 8;
const UPCOMING = 8;
// Same reason as lib/llm/openrouter.ts: a reasoning model thinks inside max_tokens.
const REASONING_HEADROOM_TOKENS = 2_000;

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** Streams the expert's answer as plain text, then stores the exchange. */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "Non authentifié");

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return fail(503, "L’expert n’est pas configuré sur ce serveur (OPENROUTER_API_KEY manquante).");

  const payload = (await req.json().catch(() => null)) as { messages?: unknown } | null;
  const history = sanitizeHistory(payload?.messages);
  const question = history.at(-1);
  if (!question || question.role !== "user") return fail(400, "Message vide.");

  // The brand is the one active in the workspace (cookie), never an id sent by the browser.
  const { brand, os, mega, userId } = await getWorkspace();
  if (!brand) return fail(409, "Aucune marque active.");

  const today = toDay(new Date());
  const [kept, upcoming] = await Promise.all([listKeptOuts(brand.id), upcomingEntries(brand.id, today, UPCOMING)]);
  const system = buildExpertSystem({
    brandName: brand.name,
    summary: os?.summary ?? "",
    canon: os?.canon ?? null,
    rules: mega?.rules ?? [],
    keptBriefs: kept.map((out) => out.payload?.brief).filter((b): b is string => Boolean(b)).slice(0, KEPT_BRIEFS),
    upcoming: upcoming.map((e) => ({ day: e.scheduled_on, channel: CHANNELS[e.channel], caption: e.caption })),
    today,
  });

  let upstream: Response;
  try {
    upstream = await fetch(ENDPOINT, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "http://localhost:3000",
        "X-Title": "Brand OS",
      },
      body: JSON.stringify({
        model: MODEL_CHAT,
        stream: true,
        temperature: 0.6,
        max_tokens: MAX_ANSWER_TOKENS + REASONING_HEADROOM_TOKENS,
        reasoning: { effort: "low" },
        messages: [{ role: "system", content: system }, ...history],
      }),
    });
  } catch {
    return fail(504, "L’expert ne répond pas. Réessayez dans un instant.");
  }
  if (!upstream.ok || !upstream.body) {
    console.error(`[expert] OpenRouter ${upstream.status}: ${(await upstream.text().catch(() => "")).slice(0, 300)}`);
    return fail(502, upstream.status === 402 ? "Crédit OpenRouter épuisé." : "L’expert est indisponible. Réessayez dans un instant.");
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let answer = "";

  const stream = upstream.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          // Server-sent events: "data: {json}" lines; comments (": OPENROUTER PROCESSING") and "[DONE]" are skipped.
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
          try {
            const delta = JSON.parse(line.slice("data: ".length))?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) {
              answer += delta;
              controller.enqueue(encoder.encode(delta));
            }
          } catch {
            // A partial JSON line: the next chunk completes it through `buffer`.
          }
        }
      },
      async flush() {
        if (answer.trim()) {
          await saveExchange(supabase, { brand, userId, question: question.content.slice(0, MAX_MESSAGE_CHARS), answer });
        }
      },
    })
  );

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
