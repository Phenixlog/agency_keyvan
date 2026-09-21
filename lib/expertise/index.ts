import { FORMAT_FAMILIES, resolveFormat, type CustomFormat } from "@/lib/brand-os";
import { isForbidden, isMissingTable } from "@/lib/db-errors";
import { chatJson, isLlmConfigured, MODEL_ANALYSIS } from "@/lib/llm/openrouter";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  MEDIUM_BRIEF_SCHEMA,
  MEDIUM_BRIEF_SYSTEM,
  fallbackMediumBrief,
  mediumKey,
  mediumUserMessage,
  parseMediumBrief,
  type MediumBrief,
} from "@/lib/expertise/model";

export * from "@/lib/expertise/model";

/** stored: read back · generated: just written by the model · fallback: no LLM (or it failed), catalogue line only. */
export type BriefSource = "stored" | "generated" | "fallback";
export type LoadedBrief = { brief: MediumBrief; source: BriefSource; label: string };

/**
 * The route handler that shows a brief and the server action that generates from it are separate
 * bundles: a module-level Map is NOT shared between them. Seen live — the action wrote a second
 * brief with other questions, and the answers picked on screen were dropped as "not offered".
 * globalThis is the one place both bundles see.
 */
type BriefMemory = { inflight: Map<string, Promise<LoadedBrief>>; remembered: Map<string, { value: LoadedBrief; at: number }> };
const holder = globalThis as typeof globalThis & { __brandOsMediumBriefs?: BriefMemory };
const shared: BriefMemory = (holder.__brandOsMediumBriefs ??= { inflight: new Map(), remembered: new Map() });

/**
 * Same process, same org, same medium: three proposals asked at once must not pay for three
 * identical briefs. Holds promises, so concurrent callers share the one call in flight.
 */
const inflight = shared.inflight;

/**
 * A few minutes of memory in front of the database. It matters most before migration 0008 is
 * applied (nothing can be stored, so without it every visit would pay for the same brief again),
 * and it spares a query per generation afterwards. Fallback briefs are never remembered.
 */
const REMEMBER_MS = 30 * 60 * 1000;
const remembered = shared.remembered;

/**
 * The expertise of a medium, for this organisation: read it, or have it written once and keep it.
 * Never throws for a missing table, a refused write or an LLM failure: a generation must not
 * depend on the expertise layer being healthy.
 */
export function getMediumBrief(args: { orgId: string; userId: string; format: string; custom?: CustomFormat | null; refresh?: boolean }): Promise<LoadedBrief> {
  const key = `${args.orgId}:${mediumKey(args.format, args.custom)}`;
  if (!args.refresh) {
    const known = remembered.get(key);
    if (known && Date.now() - known.at < REMEMBER_MS) return Promise.resolve({ ...known.value, source: "stored" });
    const pending = inflight.get(key);
    if (pending) return pending;
  }
  const work = load(args)
    .then((value) => {
      if (value.source !== "fallback") remembered.set(key, { value, at: Date.now() });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, work);
  return work;
}

async function load(args: { orgId: string; userId: string; format: string; custom?: CustomFormat | null; refresh?: boolean }): Promise<LoadedBrief> {
  const spec = resolveFormat(args.format, args.custom);
  const key = mediumKey(spec.key, args.custom);
  const supabase = await createSupabaseServerClient();

  if (!args.refresh) {
    const { data, error } = await supabase.from("medium_briefs").select("content").eq("org_id", args.orgId).eq("medium_key", key).maybeSingle();
    if (error && !isMissingTable(error)) console.error("[expertise] lecture —", error.message);
    const stored = parseMediumBrief(data?.content);
    if (stored) return { brief: stored, source: "stored", label: spec.label };
  }

  const fallback: LoadedBrief = { brief: fallbackMediumBrief(spec.direction), source: "fallback", label: spec.label };
  if (!isLlmConfigured()) return fallback;

  let brief: MediumBrief | null = null;
  try {
    brief = parseMediumBrief(
      await chatJson<unknown>({
        model: MODEL_ANALYSIS,
        system: MEDIUM_BRIEF_SYSTEM,
        user: mediumUserMessage({
          label: spec.label,
          hint: spec.hint,
          family: FORMAT_FAMILIES[spec.family],
          nature: spec.nature ?? "photo",
          aspectRatio: spec.aspectRatio,
          resolution: spec.resolution,
          use: spec.key === "custom" ? args.custom?.use : null,
        }),
        schemaName: "medium_brief",
        schema: MEDIUM_BRIEF_SCHEMA,
        maxTokens: 2200,
        timeoutMs: 60_000,
      })
    );
  } catch (e) {
    console.error("[expertise] rédaction de la fiche échouée —", e instanceof Error ? e.message : e);
  }
  if (!brief) return fallback;

  const { error } = await supabase
    .from("medium_briefs")
    .upsert({ org_id: args.orgId, medium_key: key, label: spec.label, content: brief, model: MODEL_ANALYSIS, created_by: args.userId }, { onConflict: "org_id,medium_key" });
  // Not stored (migration pending): the brief still serves this generation, it will just be written again next time.
  if (error && !isMissingTable(error) && !isForbidden(error)) console.error("[expertise] enregistrement —", error.message);
  return { brief, source: "generated", label: spec.label };
}
