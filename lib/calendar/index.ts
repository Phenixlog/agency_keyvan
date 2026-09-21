import { chatJson, isLlmConfigured, MODEL_FAST } from "@/lib/llm/openrouter";
import { isForbidden, isMissingTable } from "@/lib/db-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CAPTION_SCHEMA,
  CAPTION_SYSTEM,
  CHANNELS,
  ENTRY_STATUSES,
  isChannel,
  isValidDay,
  type CalendarEntry,
  type EntryStatus,
} from "@/lib/calendar/model";
import type { OutPayload } from "@/lib/outs";

export * from "@/lib/calendar/model";

const MAX_CAPTION = 2200; // Instagram's limit, the longest of the supported channels

export type EntryWithOut = CalendarEntry & { out: { id: string; payload: OutPayload | null } | null };

const ENTRY_COLUMNS = "id,out_id,scheduled_on,channel,caption,status,out:outs(id,payload)";

/** `null` means the migration has not been applied yet. */
export async function listEntries(brandId: string, from: string, to: string): Promise<EntryWithOut[] | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("calendar_entries")
    .select(ENTRY_COLUMNS)
    .eq("brand_id", brandId)
    .gte("scheduled_on", from)
    .lte("scheduled_on", to)
    .order("scheduled_on", { ascending: true });
  if (isMissingTable(error)) return null;
  if (error) throw error;
  return (data ?? []) as unknown as EntryWithOut[];
}

export async function nextEntry(brandId: string, today: string): Promise<EntryWithOut | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("calendar_entries")
    .select(ENTRY_COLUMNS)
    .eq("brand_id", brandId)
    .eq("status", "planned")
    .gte("scheduled_on", today)
    .order("scheduled_on", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (isMissingTable(error)) return null;
  if (error) throw error;
  return data as unknown as EntryWithOut | null;
}

export async function upcomingEntries(brandId: string, today: string, limit: number): Promise<EntryWithOut[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("calendar_entries")
    .select(ENTRY_COLUMNS)
    .eq("brand_id", brandId)
    .eq("status", "planned")
    .gte("scheduled_on", today)
    .order("scheduled_on", { ascending: true })
    .limit(limit);
  if (isMissingTable(error)) return [];
  if (error) throw error;
  return (data ?? []) as unknown as EntryWithOut[];
}

/** Kept creations of the brand, newest first: what can be scheduled. */
export async function listKeptOuts(brandId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("outs")
    .select("id,payload,created_at")
    .eq("brand_id", brandId)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as { id: string; payload: OutPayload | null; created_at: string }[];
}

export async function createEntry(args: {
  brand: { id: string; org_id: string };
  userId: string;
  day: string;
  channel: string;
  outId: string | null;
  caption: string;
}): Promise<"ok" | "invalid" | "forbidden"> {
  if (!isValidDay(args.day) || !isChannel(args.channel)) return "invalid";
  const supabase = await createSupabaseServerClient();

  // The creation must belong to this brand (RLS only checks the organisation).
  if (args.outId) {
    const { data: out } = await supabase.from("outs").select("id").eq("id", args.outId).eq("brand_id", args.brand.id).maybeSingle();
    if (!out) return "invalid";
  }
  const { error } = await supabase.from("calendar_entries").insert({
    org_id: args.brand.org_id,
    brand_id: args.brand.id,
    out_id: args.outId,
    scheduled_on: args.day,
    channel: args.channel,
    caption: args.caption.trim().slice(0, MAX_CAPTION) || null,
    created_by: args.userId,
  });
  if (isForbidden(error)) return "forbidden";
  if (error) throw error;
  return "ok";
}

export async function setEntryStatus(brandId: string, entryId: string, status: string) {
  if (!ENTRY_STATUSES.includes(status as EntryStatus)) return;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("calendar_entries").update({ status }).eq("id", entryId).eq("brand_id", brandId);
  if (error) throw error;
}

export async function deleteEntry(brandId: string, entryId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("calendar_entries").delete().eq("id", entryId).eq("brand_id", brandId);
  if (error) throw error;
}

/** Writes a caption in the brand's voice when the entry has none. */
export async function suggestCaption(args: {
  brandId: string;
  entryId: string;
  brandName: string;
  summary: string;
  rules: readonly string[];
}): Promise<"ok" | "no-llm" | "failed"> {
  if (!isLlmConfigured()) return "no-llm";
  const supabase = await createSupabaseServerClient();
  const { data: entry } = await supabase
    .from("calendar_entries")
    .select(ENTRY_COLUMNS)
    .eq("id", args.entryId)
    .eq("brand_id", args.brandId)
    .maybeSingle();
  if (!entry) return "failed";
  const typed = entry as unknown as EntryWithOut;

  try {
    const { caption } = await chatJson<{ caption: string }>({
      model: MODEL_FAST,
      system: CAPTION_SYSTEM,
      user: [
        `Marque : ${args.brandName}`,
        `Brand OS :\n${args.summary}`,
        args.rules.length ? `Règles apprises :\n- ${args.rules.join("\n- ")}` : "",
        `Canal : ${CHANNELS[typed.channel]}`,
        `Date de publication : ${typed.scheduled_on}`,
        `Visuel associé (brief) : """${typed.out?.payload?.brief || "aucun visuel, ou visuel sans brief"}"""`,
        typed.caption ? `Brouillon actuel à améliorer : """${typed.caption}"""` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      schemaName: "caption",
      schema: CAPTION_SCHEMA,
      maxTokens: 700,
      temperature: 0.7,
      timeoutMs: 25_000,
    });
    if (!caption?.trim()) throw new Error("légende vide");
    const { error } = await supabase
      .from("calendar_entries")
      .update({ caption: caption.trim().slice(0, MAX_CAPTION) })
      .eq("id", args.entryId)
      .eq("brand_id", args.brandId);
    if (error) throw error;
    return "ok";
  } catch (e) {
    console.error("[calendar] légende échouée —", e instanceof Error ? e.message : e);
    return "failed";
  }
}
