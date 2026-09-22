import { isMissingColumn, isMissingTable } from "@/lib/db-errors";
import { daysFrom, entryReadiness } from "@/lib/calendar/model";
import { isBrandOS } from "@/lib/brand-os";
import { outImageUrl, type OutPayload } from "@/lib/outs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { brandColorFromPalette } from "@/lib/tokens";
import { listBrands } from "@/lib/workspace";

/** A publication of the coming week, seen from the list of clients. */
export type WeekItem = {
  entryId: string;
  brandId: string;
  brandName: string;
  color: string;
  day: string;
  channel: string;
  ready: boolean;
  missing: string[];
  clientStatus: "pending" | "approved" | "changes" | null;
  headline: string | null;
};

/** The month's spend on images, counted from what was drawn (never a made-up KPI). */
export type ClientCost = { images: number; euros: number };

/** ≈ $0.024 per generated image, ≈ $0.039 when a reference (logo, photo, creation) travels with it; 4K costs more but the rate is not documented — the figure is a floor. */
const PRICE_DESCRIBE = 0.024;
const PRICE_EDIT = 0.039;
const USD_TO_EUR = 0.92;

export type ClientSignals = {
  /** Créations ni gardées ni archivées : elles attendent un tri. */
  drafts: number;
  kept: number;
  /** Prochaine publication planifiée (AAAA-MM-JJ), ou null. */
  nextPublication: string | null;
  /** « draft » : produit sans analyse IA · « none » : pas encore de Brand OS. */
  brandOS: "ready" | "draft" | "none";
  brandOSVersion: number | null;
  pendingProposals: number;
  hasStrategy: boolean;
  /** Publications of the next 7 days that still lack a visual or a caption. */
  weekUnready: number;
  /** Publications the end client asked to change (through the validation link). */
  clientChanges: number;
  /** Images drawn this month, and what they cost. */
  cost: ClientCost;
};

export type ClientCard = ClientSignals & {
  id: string;
  name: string;
  color: string;
  promise: string | null;
  /** Dernière création, pour reconnaître le client d'un coup d'œil. */
  cover: string | null;
};

const RECENT_OUTS_SCANNED = 400;

/**
 * Every active client with its signals, in four grouped queries (not four per client).
 * Tables from pending migrations are simply counted as empty.
 */
export async function listClientCards(today: string): Promise<{ active: ClientCard[]; archived: { id: string; name: string }[] }> {
  const supabase = await createSupabaseServerClient();
  const [brands, archived] = await Promise.all([listBrands(supabase, false), listBrands(supabase, true)]);
  const ids = brands.map((b) => b.id);
  if (!ids.length) return { active: [], archived };

  const monthStart = `${today.slice(0, 7)}-01`;
  const weekEnd = daysFrom(today, 7)[6]!;
  const [outs, versions, entries, proposals, monthOuts, week] = await Promise.all([
    supabase.from("outs").select("brand_id,status,payload,created_at").in("brand_id", ids).neq("status", "archived").order("created_at", { ascending: false }).limit(RECENT_OUTS_SCANNED),
    supabase.from("brand_os_versions").select("brand_id,version,canon").in("brand_id", ids).order("version", { ascending: false }),
    supabase.from("calendar_entries").select("brand_id,scheduled_on").in("brand_id", ids).eq("status", "planned").gte("scheduled_on", today).order("scheduled_on", { ascending: true }),
    supabase.from("expert_messages").select("brand_id").in("brand_id", ids).eq("proposal_state", "pending"),
    // Every image of the month, archived ones included: they were paid for too.
    supabase.from("outs").select("brand_id,payload").in("brand_id", ids).gte("created_at", `${monthStart}T00:00:00Z`).limit(2000),
    readWeek(supabase, ids, today, weekEnd),
  ]);
  if (outs.error) throw outs.error;
  if (versions.error) throw versions.error;
  if (entries.error && !isMissingTable(entries.error)) throw entries.error;
  if (proposals.error && !isMissingTable(proposals.error)) throw proposals.error;

  const active = brands.map((brand): ClientCard => {
    const mine = (outs.data ?? []).filter((o) => o.brand_id === brand.id);
    const latest = (versions.data ?? []).find((v) => v.brand_id === brand.id); // ordered by version desc
    const canon = isBrandOS(latest?.canon) ? latest.canon : null;
    const generatedBy = (latest?.canon as { generated_by?: string } | null)?.generated_by;
    return {
      id: brand.id,
      name: brand.name,
      color: brandColorFromPalette(canon?.visual.palette),
      promise: canon?.promise ?? null,
      cover: outImageUrl((mine[0]?.payload as OutPayload | null) ?? null),
      drafts: mine.filter((o) => o.status === "draft").length,
      kept: mine.filter((o) => o.status === "ready").length,
      nextPublication: (entries.data ?? []).find((e) => e.brand_id === brand.id)?.scheduled_on ?? null,
      brandOS: !latest ? "none" : generatedBy === "fallback" ? "draft" : "ready",
      brandOSVersion: latest?.version ?? null,
      pendingProposals: (proposals.data ?? []).filter((p) => p.brand_id === brand.id).length,
      hasStrategy: Boolean(canon?.strategy),
      weekUnready: week.filter((w) => w.brand_id === brand.id && !entryReadiness(w).ready).length,
      clientChanges: week.filter((w) => w.brand_id === brand.id && w.client_status === "changes").length,
      cost: costOf((monthOuts.data ?? []).filter((o) => o.brand_id === brand.id).map((o) => o.payload as OutPayload | null)),
    };
  });
  return { active, archived };
}

type WeekRow = { id: string; brand_id: string; scheduled_on: string; channel: string; caption: string | null; out_id: string | null; client_status?: string | null; content?: { headline?: string } | null };

/** The planned publications of a window, across brands; columns of pending migrations are simply absent. */
async function readWeek(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, ids: string[], from: string, to: string): Promise<WeekRow[]> {
  const base = "id,brand_id,scheduled_on,channel,caption,out_id";
  const build = (columns: string) => supabase.from("calendar_entries").select(columns).in("brand_id", ids).eq("status", "planned").gte("scheduled_on", from).lte("scheduled_on", to).order("scheduled_on", { ascending: true });
  let { data, error } = await build(`${base},client_status,content`);
  if (isMissingColumn(error)) ({ data, error } = await build(`${base},client_status`));
  if (isMissingColumn(error)) ({ data, error } = await build(base));
  if (isMissingTable(error)) return [];
  if (error) throw error;
  return (data ?? []) as unknown as WeekRow[];
}

function costOf(payloads: (OutPayload | null)[]): ClientCost {
  const usd = payloads.reduce((sum, p) => sum + (p?.mode === "restage" || p?.mode === "retouch" || p?.tile?.logo ? PRICE_EDIT : PRICE_DESCRIBE), 0);
  return { images: payloads.length, euros: Math.round(usd * USD_TO_EUR * 100) / 100 };
}

/**
 * The week to come, every client at once: what is planned, what still lacks something, what the end
 * client sent back. The list of clients is the place to see it (Keyvan: « ma semaine, tous clients »).
 */
export async function weekAcrossClients(today: string): Promise<WeekItem[]> {
  const supabase = await createSupabaseServerClient();
  const brands = await listBrands(supabase, false);
  if (!brands.length) return [];
  const [rows, versions] = await Promise.all([
    readWeek(supabase, brands.map((b) => b.id), today, daysFrom(today, 7)[6]!),
    supabase.from("brand_os_versions").select("brand_id,version,canon").in("brand_id", brands.map((b) => b.id)).order("version", { ascending: false }),
  ]);
  const colours = new Map(brands.map((b) => {
    const latest = (versions.data ?? []).find((v) => v.brand_id === b.id);
    return [b.id, brandColorFromPalette(isBrandOS(latest?.canon) ? latest.canon.visual.palette : undefined)];
  }));
  return rows.map((row) => {
    const brand = brands.find((b) => b.id === row.brand_id)!;
    const { ready, missing } = entryReadiness(row);
    return {
      entryId: row.id,
      brandId: brand.id,
      brandName: brand.name,
      color: colours.get(brand.id) ?? brandColorFromPalette(undefined),
      day: row.scheduled_on,
      channel: row.channel,
      ready,
      missing,
      clientStatus: (row.client_status as WeekItem["clientStatus"]) ?? null,
      headline: row.content?.headline ?? null,
    };
  });
}
