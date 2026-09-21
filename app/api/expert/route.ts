import { NextResponse, type NextRequest } from "next/server";
import { toDay, upcomingEntries, CHANNELS } from "@/lib/calendar";
import { resolveFormat } from "@/lib/brand-os";
import { MAX_ANSWER_TOKENS, MAX_MESSAGE_CHARS, MODEL_CHAT, buildExpertSystem, parseProposal, sanitizeHistory, saveExchange, splitAnswer } from "@/lib/expert";
import { outImageUrl, type OutPayload } from "@/lib/outs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 90_000;
// Each 1024 px image costs the model roughly 1 500 tokens: four is enough to judge a direction.
const CREATIONS_SHOWN = 4;
const STATUS_LABEL: Record<string, string> = { ready: "gardée", draft: "brouillon" };
const UPCOMING = 6;
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

  const payload = (await req.json().catch(() => null)) as { messages?: unknown; focusOutId?: unknown } | null;
  const history = sanitizeHistory(payload?.messages);
  const question = history.at(-1);
  if (!question || question.role !== "user") return fail(400, "Message vide.");

  // The brand is the one active in the workspace (cookie), never an id sent by the browser.
  const { brand, os, mega, userId } = await getWorkspace();
  if (!brand) return fail(409, "Aucune marque active.");

  const today = toDay(new Date());
  const [{ data: outs }, upcoming] = await Promise.all([
    supabase
      .from("outs")
      .select("id,status,created_at,payload")
      .eq("brand_id", brand.id)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(CREATIONS_SHOWN),
    upcomingEntries(brand.id, today, UPCOMING),
  ]);
  // "C'est un problème de marque" on a Studio tile: that creation is what the user is talking about.
  // Looked up within the active brand, so an id from the browser cannot reach another client's image.
  const focusId = typeof payload?.focusOutId === "string" && /^[0-9a-f-]{36}$/i.test(payload.focusOutId) ? payload.focusOutId : null;
  const { data: focusOut } = focusId
    ? await supabase.from("outs").select("id,status,created_at,payload").eq("id", focusId).eq("brand_id", brand.id).maybeSingle()
    : { data: null };

  const creations = [...(focusOut ? [focusOut] : []), ...(outs ?? []).filter((out) => out.id !== focusOut?.id)]
    .slice(0, CREATIONS_SHOWN)
    .map((out) => ({ out, url: outImageUrl(out.payload as OutPayload | null) }))
    .filter((c): c is typeof c & { url: string } => Boolean(c.url));

  const system = buildExpertSystem({
    brandName: brand.name,
    summary: os?.summary ?? "",
    canon: os?.canon ?? null,
    guidance: mega?.intro ?? "",
    rules: mega?.rules ?? [],
    creations: creations.map(({ out }) => {
      const payload = out.payload as OutPayload | null;
      return {
        status: STATUS_LABEL[out.status as string] ?? String(out.status),
        format: payload?.format_label || resolveFormat(payload?.format).label,
        brief: payload?.brief ?? null,
        day: String(out.created_at).slice(0, 10),
      };
    }),
    upcoming: upcoming.map((e) => ({ day: e.scheduled_on, channel: CHANNELS[e.channel], caption: e.caption })),
    today,
  });

  // The expert judges what was actually produced, not what the brief hoped for: the images go with
  // the question. Only on the last turn, so the history does not pay for them again at every message.
  const messages = [
    { role: "system", content: system },
    ...history.slice(0, -1),
    {
      role: "user",
      content: [
        { type: "text", text: focusOut ? `${question.content}\n\n(Je parle de la création n°1, la première image jointe.)` : question.content },
        ...creations.map(({ url }) => ({ type: "image_url", image_url: { url } })),
      ],
    },
  ];

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
        messages,
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
        if (!answer.trim()) return;
        // Store the readable text and the validated proposal separately: raw JSON never reaches the thread.
        const { text, raw } = splitAnswer(answer);
        await saveExchange(supabase, {
          brand,
          userId,
          question: question.content.slice(0, MAX_MESSAGE_CHARS),
          answer: text || "Voici ce que je propose.",
          proposal: raw ? parseProposal(raw) : null,
        });
      },
    })
  );

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
