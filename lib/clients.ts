import { isMissingTable } from "@/lib/db-errors";
import { isBrandOS } from "@/lib/brand-os";
import { outImageUrl, type OutPayload } from "@/lib/outs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { brandColorFromPalette } from "@/lib/tokens";
import { listBrands } from "@/lib/workspace";

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

  const [outs, versions, entries, proposals] = await Promise.all([
    supabase.from("outs").select("brand_id,status,payload,created_at").in("brand_id", ids).neq("status", "archived").order("created_at", { ascending: false }).limit(RECENT_OUTS_SCANNED),
    supabase.from("brand_os_versions").select("brand_id,version,canon").in("brand_id", ids).order("version", { ascending: false }),
    supabase.from("calendar_entries").select("brand_id,scheduled_on").in("brand_id", ids).eq("status", "planned").gte("scheduled_on", today).order("scheduled_on", { ascending: true }),
    supabase.from("expert_messages").select("brand_id").in("brand_id", ids).eq("proposal_state", "pending"),
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
    };
  });
  return { active, archived };
}
