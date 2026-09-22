import { randomBytes } from "node:crypto";
import { chatJson, isLlmConfigured, MODEL_ANALYSIS, MODEL_FAST } from "@/lib/llm/openrouter";
import { isForbidden, isMissingColumn, isMissingTable } from "@/lib/db-errors";
import { resolveFormat, type BrandOS } from "@/lib/brand-os";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { brandColorFromPalette } from "@/lib/tokens";
import {
  CAPTION_SCHEMA,
  CAPTION_SYSTEM,
  CHANNELS,
  CLIENT_STATUSES,
  ENTRY_STATUSES,
  PLAN_SCHEMA,
  PLAN_SYSTEM,
  fallbackPlan,
  isChannel,
  isValidDay,
  missingSlots,
  monthGrid,
  parsePlan,
  planUserMessage,
  validCadence,
  type CalendarEntry,
  type Channel,
  type ClientStatus,
  type EntryStatus,
  type PlanItem,
} from "@/lib/calendar/model";
import { outImageUrl, type OutPayload } from "@/lib/outs";

export * from "@/lib/calendar/model";

const MAX_CAPTION = 2200; // Instagram's limit, the longest of the supported channels

export type EntryWithOut = CalendarEntry & { out: { id: string; payload: OutPayload | null } | null };

const BASE_COLUMNS = "id,out_id,scheduled_on,channel,caption,status,out:outs(id,payload)";
/** With migration 0009: the angle, the visual still to make, and what the end client said. */
const ENTRY_COLUMNS = `${BASE_COLUMNS},angle,idea,client_status,client_comment,client_reviewed_at`;
/** Migration 0012: the planned tile (kind, headline, background). */
const CONTENT_COLUMNS = `${ENTRY_COLUMNS},content`;

type Read<T> = PromiseLike<{ data: T; error: { code?: string; message: string } | null }>;
/** Before migration 0009 the new columns do not exist: read again without them rather than break the calendar. */
async function readEntries<T>(build: (columns: string) => Read<T>) {
  const withContent = await build(CONTENT_COLUMNS);
  if (!isMissingColumn(withContent.error)) return withContent;
  const full = await build(ENTRY_COLUMNS);
  return isMissingColumn(full.error) ? build(BASE_COLUMNS) : full;
}

/** `null` means the migration has not been applied yet. */
export async function listEntries(brandId: string, from: string, to: string): Promise<EntryWithOut[] | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await readEntries((columns) =>
    supabase.from("calendar_entries").select(columns).eq("brand_id", brandId).gte("scheduled_on", from).lte("scheduled_on", to).order("scheduled_on", { ascending: true })
  );
  if (isMissingTable(error)) return null;
  if (error) throw error;
  return (data ?? []) as unknown as EntryWithOut[];
}

export async function nextEntry(brandId: string, today: string): Promise<EntryWithOut | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await readEntries((columns) =>
    supabase.from("calendar_entries").select(columns).eq("brand_id", brandId).eq("status", "planned").gte("scheduled_on", today).order("scheduled_on", { ascending: true }).limit(1).maybeSingle()
  );
  if (isMissingTable(error)) return null;
  if (error) throw error;
  return data as unknown as EntryWithOut | null;
}

export async function upcomingEntries(brandId: string, today: string, limit: number): Promise<EntryWithOut[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await readEntries((columns) =>
    supabase.from("calendar_entries").select(columns).eq("brand_id", brandId).eq("status", "planned").gte("scheduled_on", today).order("scheduled_on", { ascending: true }).limit(limit)
  );
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
  const { data: entry } = await readEntries((columns) => supabase.from("calendar_entries").select(columns).eq("id", args.entryId).eq("brand_id", args.brandId).maybeSingle());
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
        typed.angle ? `Angle éditorial de cette publication : """${typed.angle}"""` : "",
        `Visuel associé (brief) : """${typed.out?.payload?.brief || typed.idea || "aucun visuel, ou visuel sans brief"}"""`,
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

/* ------------------------------------------------------------------ */
/* Modifier une publication sur place                                   */
/* ------------------------------------------------------------------ */

/** Date, canal, création et légende. Ce que le client avait validé ne vaut plus si le contenu change. */
export async function updateEntry(args: {
  brandId: string;
  entryId: string;
  day: string;
  channel: string;
  outId: string | null;
  caption: string;
}): Promise<"ok" | "invalid"> {
  if (!isValidDay(args.day) || !isChannel(args.channel)) return "invalid";
  const supabase = await createSupabaseServerClient();
  if (args.outId) {
    const { data: out } = await supabase.from("outs").select("id").eq("id", args.outId).eq("brand_id", args.brandId).maybeSingle();
    if (!out) return "invalid";
  }
  const content = { scheduled_on: args.day, channel: args.channel, out_id: args.outId, caption: args.caption.trim().slice(0, MAX_CAPTION) || null };
  const target = () => supabase.from("calendar_entries");
  let { error } = await target().update({ ...content, client_status: "pending", client_comment: null, client_reviewed_at: null }).eq("id", args.entryId).eq("brand_id", args.brandId);
  if (isMissingColumn(error)) ({ error } = await target().update(content).eq("id", args.entryId).eq("brand_id", args.brandId));
  if (error) throw error;
  return "ok";
}

/**
 * "Créer ce visuel" from a calendar day: once the lot is drawn, its first creation takes the slot,
 * so the calendar fills itself; the user swaps it for another proposal with the picker if they prefer.
 * Never overwrites a visual already chosen.
 */
export async function attachLotToEntry(args: { brandId: string; entryId: string; batchId: string; background?: string | null }): Promise<"ok" | "skipped"> {
  const supabase = await createSupabaseServerClient();
  const { data: entry } = await supabase.from("calendar_entries").select("id,out_id").eq("id", args.entryId).eq("brand_id", args.brandId).maybeSingle();
  if (!entry || entry.out_id) return "skipped";
  const { data: outs } = await supabase.from("outs").select("id,payload,created_at").eq("brand_id", args.brandId).order("created_at", { ascending: true }).limit(60);
  const lot = (outs ?? []).filter((out) => (out.payload as { batch_id?: string } | null)?.batch_id === args.batchId);
  // The planned background wins (the checkerboard of the month), else the first proposal.
  const first = lot.find((out) => args.background && (out.payload as { tile?: { background?: string } } | null)?.tile?.background === args.background) ?? lot[0];
  if (!first) return "skipped";
  const { error } = await supabase.from("calendar_entries").update({ out_id: first.id }).eq("id", args.entryId).eq("brand_id", args.brandId);
  if (error) throw error;
  return "ok";
}

/* ------------------------------------------------------------------ */
/* Proposer le mois                                                     */
/* ------------------------------------------------------------------ */

export type ProposeOutcome = { status: "ok"; count: number; source: "llm" | "fallback" } | { status: "complete" | "past" | "nothing" | "no-cadence" | "migration-needed" };

const monthBounds = (month: string) => {
  const days = monthGrid(month).flat().filter((d) => d.inMonth).map((d) => d.day);
  return { first: days[0], last: days[days.length - 1] };
};

/**
 * Brand OS proposes what is missing this month to hold the rhythm set with the expert. The proposals
 * land in the calendar as `proposed` entries: nothing counts until the user accepts them.
 * Asking again replaces the previous proposals of the month (never what was accepted).
 */
export async function proposeMonth(args: {
  brand: { id: string; org_id: string; name: string };
  userId: string;
  month: string;
  today: string;
  canon: BrandOS | null;
  summary: string;
}): Promise<ProposeOutcome> {
  const grid = monthGrid(args.month);
  const weeks = grid.map((week) => week.map((d) => d.day));
  const days = grid.flat().filter((d) => d.inMonth && d.day >= args.today).map((d) => d.day);
  if (!days.length) return { status: "past" };

  const supabase = await createSupabaseServerClient();
  // Before migration 0009 a proposal cannot be stored: say so before paying for a model call.
  const probe = await supabase.from("calendar_entries").select("angle").limit(1);
  if (isMissingColumn(probe.error) || isMissingTable(probe.error)) return { status: "migration-needed" };

  const { first, last } = monthBounds(args.month);
  const cleared = await supabase.from("calendar_entries").delete().eq("brand_id", args.brand.id).eq("status", "proposed").gte("scheduled_on", first).lte("scheduled_on", last);
  if (cleared.error && !isMissingTable(cleared.error)) throw cleared.error;

  const entries = ((await listEntries(args.brand.id, weeks[0][0], weeks[weeks.length - 1][6])) ?? []).filter((e) => e.status !== "canceled");
  const taken = entries.map((e) => `${e.scheduled_on}|${e.channel}`);
  const cadence = validCadence(args.canon?.strategy?.cadence);
  const missing = cadence.length ? missingSlots(cadence, weeks, entries, days) : undefined;
  if (missing && missing.size === 0) return { status: "complete" };

  // Ready creations that are not on the calendar yet, whatever the month.
  const [kept, scheduled] = await Promise.all([
    listKeptOuts(args.brand.id),
    supabase.from("calendar_entries").select("out_id").eq("brand_id", args.brand.id).neq("status", "canceled").not("out_id", "is", null),
  ]);
  const used = new Set((scheduled.data ?? []).map((row) => row.out_id as string));
  const available = kept.filter((out) => !used.has(out.id)).slice(0, 20);
  const limits = { days, taken, creations: available.length, missing };

  let plan: PlanItem[] = [];
  let source: "llm" | "fallback" = "fallback";
  if (isLlmConfigured()) {
    try {
      const raw = await chatJson<unknown>({
        model: MODEL_ANALYSIS,
        system: PLAN_SYSTEM,
        user: planUserMessage({
          brandName: args.brand.name,
          summary: args.summary,
          today: args.today,
          days,
          gaps: Array.from(missing ?? [], ([slot, count]) => ({ week: slot.split("|")[0], channel: CHANNELS[slot.split("|")[1] as Channel], missing: count })),
          taken: entries.map((e) => ({ day: e.scheduled_on, channel: CHANNELS[e.channel] })),
          creations: available.map((out) => ({ brief: out.payload?.brief ?? "", format: out.payload?.format_label || resolveFormat(out.payload?.format).label, ratio: out.payload?.aspect_ratio ?? "" })),
        }),
        schemaName: "month_plan",
        schema: PLAN_SCHEMA,
        maxTokens: 4000,
        temperature: 0.6,
        timeoutMs: 60_000,
      });
      plan = parsePlan(raw, limits);
      source = "llm";
    } catch (e) {
      console.error("[calendar] proposition du mois : repli déterministe —", e instanceof Error ? e.message : e);
    }
  }
  if (!plan.length) {
    if (!missing) return { status: "no-cadence" };
    plan = fallbackPlan({ ...limits, angles: args.canon?.strategy?.angles ?? [] });
    source = "fallback";
  }
  if (!plan.length) return { status: "nothing" };

  const rows = plan.map((item) => ({
    org_id: args.brand.org_id,
    brand_id: args.brand.id,
    out_id: item.creation ? available[item.creation - 1].id : null,
    scheduled_on: item.day,
    channel: item.channel,
    status: "proposed",
    angle: item.angle || null,
    idea: item.idea || null,
    created_by: args.userId,
  }));
  let { error } = await supabase.from("calendar_entries").insert(rows.map((row, i) => ({ ...row, content: plan[i]!.content })));
  // Before migration 0012 the planned tile has nowhere to live: the entry keeps its idea, the Studio starts from it.
  if (isMissingColumn(error)) ({ error } = await supabase.from("calendar_entries").insert(rows));
  // 23514: the status check of 0004 does not know "proposed" yet.
  if (isMissingColumn(error) || error?.code === "23514") return { status: "migration-needed" };
  if (error) throw error;
  return { status: "ok", count: plan.length, source };
}

/** Accept one proposal, or every proposal of the month. */
export async function acceptProposals(brandId: string, scope: { entryId: string } | { month: string }) {
  const supabase = await createSupabaseServerClient();
  const query = supabase.from("calendar_entries").update({ status: "planned" }).eq("brand_id", brandId).eq("status", "proposed");
  const { first, last } = "month" in scope ? monthBounds(scope.month) : { first: "", last: "" };
  const { error } = await ("entryId" in scope ? query.eq("id", scope.entryId) : query.gte("scheduled_on", first).lte("scheduled_on", last));
  if (error) throw error;
}

export async function discardProposals(brandId: string, month: string) {
  const supabase = await createSupabaseServerClient();
  const { first, last } = monthBounds(month);
  const { error } = await supabase.from("calendar_entries").delete().eq("brand_id", brandId).eq("status", "proposed").gte("scheduled_on", first).lte("scheduled_on", last);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Lien public : le client final valide le planning                     */
/* ------------------------------------------------------------------ */

export type CalendarShare = { token: string; createdAt: string };

/** `undefined`: migration 0009 pending. */
export async function getCalendarShare(brandId: string): Promise<CalendarShare | null | undefined> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("calendar_shares").select("token,created_at").eq("brand_id", brandId).is("revoked_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (isMissingTable(error)) {
    console.warn("[calendar] calendar_shares introuvable —", error?.code, error?.message);
    return undefined;
  }
  if (error) throw error;
  return data ? { token: data.token as string, createdAt: data.created_at as string } : null;
}

export async function createCalendarShare(args: { brandId: string; orgId: string; userId: string }): Promise<"ok" | "migration-needed"> {
  const supabase = await createSupabaseServerClient();
  // 32 random bytes: the link is the only secret, it must not be guessable.
  const token = randomBytes(32).toString("base64url");
  const { error } = await supabase.from("calendar_shares").insert({ org_id: args.orgId, brand_id: args.brandId, token, created_by: args.userId });
  if (isMissingTable(error) || isForbidden(error)) return "migration-needed";
  if (error) throw error;
  return "ok";
}

/** Revoking keeps the row (audit) and kills the link at once. */
export async function revokeCalendarShares(brandId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("calendar_shares").update({ revoked_at: new Date().toISOString() }).eq("brand_id", brandId).is("revoked_at", null);
  if (error && !isMissingTable(error)) throw error;
}

const TOKEN = /^[A-Za-z0-9_-]{40,64}$/;
const MAX_CLIENT_COMMENT = 500;
const PUBLIC_ENTRIES = 40;

/** Only what the end client needs to say yes or no: no brief, no prompt, no rule, no strategy. */
export type PublicEntry = { id: string; day: string; channel: Channel; caption: string | null; imageUrl: string | null; clientStatus: ClientStatus; clientComment: string | null };
export type PublicPlanning = { brandName: string; color: string; entries: PublicEntry[] };

async function brandOfToken(token: string) {
  if (!TOKEN.test(token)) return null;
  const admin = createSupabaseAdminClient();
  const { data: share, error } = await admin.from("calendar_shares").select("brand_id").eq("token", token).is("revoked_at", null).maybeSingle();
  if (error || !share) return null;
  return { admin, brandId: share.brand_id as string };
}

/** Service-key read, strictly scoped by the token's brand: upcoming planned publications only. */
export async function loadPublicPlanning(token: string, today: string): Promise<PublicPlanning | null> {
  const found = await brandOfToken(token);
  if (!found) return null;
  const { admin, brandId } = found;
  const [{ data: brand }, { data: os }, { data: rows, error }] = await Promise.all([
    admin.from("brands").select("name").eq("id", brandId).maybeSingle(),
    admin.from("brand_os_versions").select("canon").eq("brand_id", brandId).order("version", { ascending: false }).limit(1).maybeSingle(),
    admin
      .from("calendar_entries")
      .select("id,scheduled_on,channel,caption,client_status,client_comment,out:outs(payload)")
      .eq("brand_id", brandId)
      .eq("status", "planned")
      .gte("scheduled_on", today)
      .order("scheduled_on", { ascending: true })
      .limit(PUBLIC_ENTRIES),
  ]);
  if (!brand || error) return null;
  const palette = (os?.canon as BrandOS | null)?.visual?.palette;
  return {
    brandName: brand.name as string,
    color: brandColorFromPalette(palette),
    entries: (rows ?? []).map((row) => {
      const r = row as unknown as { id: string; scheduled_on: string; channel: Channel; caption: string | null; client_status: ClientStatus; client_comment: string | null; out: { payload: OutPayload | null } | null };
      return { id: r.id, day: r.scheduled_on, channel: r.channel, caption: r.caption, imageUrl: outImageUrl(r.out?.payload), clientStatus: r.client_status, clientComment: r.client_comment };
    }),
  };
}

/**
 * The end client's verdict. The token is the only authority: it designates one brand, and the write
 * touches nothing but the three client_* columns of a planned, upcoming publication of that brand.
 */
export async function reviewEntry(args: { token: string; entryId: string; verdict: string; comment: string; today: string }): Promise<boolean> {
  if (!(CLIENT_STATUSES as readonly string[]).includes(args.verdict) || args.verdict === "pending") return false;
  if (!/^[0-9a-f-]{36}$/i.test(args.entryId)) return false;
  const found = await brandOfToken(args.token);
  if (!found) return false;
  const comment = args.verdict === "changes" ? args.comment.trim().replace(/\s+/g, " ").slice(0, MAX_CLIENT_COMMENT) || null : null;
  const { data, error } = await found.admin
    .from("calendar_entries")
    .update({ client_status: args.verdict, client_comment: comment, client_reviewed_at: new Date().toISOString() })
    .eq("id", args.entryId)
    .eq("brand_id", found.brandId)
    .eq("status", "planned")
    .gte("scheduled_on", args.today)
    .select("id");
  return !error && Boolean(data?.length);
}
