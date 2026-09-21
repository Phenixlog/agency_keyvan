import type { SupabaseClient } from "@supabase/supabase-js";
import { isBrandOS, type BrandOS } from "@/lib/brand-os";
import { outImageUrl, type OutPayload } from "@/lib/outs";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { brandColorFromPalette } from "@/lib/tokens";

const WALL_SIZE = 5;

/** Everything the brand board shows — and nothing else (no rules, no history, no conversation). */
export type BoardData = {
  name: string;
  canon: BrandOS;
  version: number;
  analysedAt: string;
  color: string;
  logo: string | null;
  siteUrl: string | null;
  /** Kept creations, newest first: the brand as it actually looks. */
  wall: { src: string; alt: string }[];
};

/** Works with the signed-in user's client (RLS) and with the service client (public link). */
export async function loadBoard(supabase: SupabaseClient, brandId: string): Promise<BoardData | null> {
  const [{ data: brand }, { data: os }, { data: outs }] = await Promise.all([
    supabase.from("brands").select("name,data").eq("id", brandId).maybeSingle(),
    supabase.from("brand_os_versions").select("version,canon,created_at").eq("brand_id", brandId).order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("outs").select("payload").eq("brand_id", brandId).eq("status", "ready").order("created_at", { ascending: false }).limit(WALL_SIZE),
  ]);
  if (!brand || !os || !isBrandOS(os.canon)) return null;

  const data = (brand.data ?? {}) as { url?: string | null; site?: { logo?: string | null } | null };
  return {
    name: brand.name as string,
    canon: os.canon,
    version: os.version as number,
    analysedAt: os.created_at as string,
    color: brandColorFromPalette(os.canon.visual.palette),
    logo: data.site?.logo ?? null,
    siteUrl: data.url ?? null,
    wall: (outs ?? [])
      .map((out) => ({ src: outImageUrl(out.payload as OutPayload | null), alt: (out.payload as OutPayload | null)?.brief ?? "" }))
      .filter((image): image is { src: string; alt: string } => Boolean(image.src)),
  };
}

/**
 * The public link. The visitor is anonymous, so RLS would hide everything: this is the one place
 * that reads with the service key — strictly by token, strictly the board's fields.
 */
export async function loadPublicBoard(token: string): Promise<BoardData | null> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const admin = createSupabaseAdminClient();
  const { data: share, error } = await admin.from("brand_shares").select("brand_id").eq("token", token).is("revoked_at", null).maybeSingle();
  if (error || !share) return null;
  return loadBoard(admin, share.brand_id as string);
}
