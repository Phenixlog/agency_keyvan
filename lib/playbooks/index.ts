import { chatJson, isLlmConfigured, MODEL_ANALYSIS } from "@/lib/llm/openrouter";
import { isForbidden, isMissingTable } from "@/lib/db-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PLAYBOOKS_SCHEMA,
  PLAYBOOKS_SYSTEM,
  isPlaybooks,
  playbooksUserMessage,
  type PlaybookKind,
  type Playbooks,
} from "@/lib/playbooks/model";

export * from "@/lib/playbooks/model";

export type StoredPlaybooks =
  | { state: "missing-table" }
  | { state: "empty" }
  | { state: "ready"; playbooks: Playbooks; osVersion: number; updatedAt: string };

export async function getPlaybooks(brandId: string): Promise<StoredPlaybooks> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("playbooks")
    .select("kind,content,os_version,updated_at")
    .eq("brand_id", brandId);
  if (isMissingTable(error)) return { state: "missing-table" };
  if (error) throw error;

  const byKind = Object.fromEntries((data ?? []).map((row) => [row.kind, row.content]));
  if (!isPlaybooks(byKind)) return { state: "empty" };
  return {
    state: "ready",
    playbooks: byKind,
    osVersion: Math.min(...data!.map((row) => row.os_version as number)),
    updatedAt: data!.map((row) => row.updated_at as string).sort().at(-1)!,
  };
}

/** One LLM call for the three guides, so they stay consistent with each other. */
export async function generatePlaybooks(args: {
  brand: { id: string; name: string; org_id: string };
  userId: string;
  summary: string;
  canon: unknown;
  osVersion: number;
  rules: readonly string[];
}): Promise<"ok" | "no-llm" | "failed" | "forbidden"> {
  if (!isLlmConfigured()) return "no-llm";

  let playbooks: Playbooks;
  try {
    playbooks = await chatJson<Playbooks>({
      model: MODEL_ANALYSIS,
      system: PLAYBOOKS_SYSTEM,
      user: playbooksUserMessage({ name: args.brand.name, summary: args.summary, canon: args.canon, rules: args.rules }),
      schemaName: "playbooks",
      schema: PLAYBOOKS_SCHEMA,
      maxTokens: 5000,
      timeoutMs: 90_000,
    });
    if (!isPlaybooks(playbooks)) throw new Error("forme inattendue");
  } catch (e) {
    console.error("[playbooks] génération échouée —", e instanceof Error ? e.message : e);
    return "failed";
  }

  const supabase = await createSupabaseServerClient();
  const rows = (Object.keys(playbooks) as PlaybookKind[]).map((kind) => ({
    org_id: args.brand.org_id,
    brand_id: args.brand.id,
    kind,
    content: playbooks[kind],
    os_version: args.osVersion,
    created_by: args.userId,
  }));
  const { error } = await supabase.from("playbooks").upsert(rows, { onConflict: "brand_id,kind" });
  if (isForbidden(error)) return "forbidden";
  if (error) throw error;
  return "ok";
}
