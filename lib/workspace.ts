import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isMissingColumn } from "@/lib/db-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isBrandOS, normalizeMega, type BrandOS, type MegaPrompt } from "@/lib/brand-os";
import { brandColorFromPalette } from "@/lib/tokens";

export const ACTIVE_BRAND_COOKIE = "active_brand";

export type Workspace = {
  userId: string;
  email: string | null;
  brands: { id: string; name: string; org_id: string }[];
  /** Marque active : cookie, sinon la plus ancienne. Null tant qu'aucune marque n'existe. */
  brand: { id: string; name: string; org_id: string } | null;
  os: { version: number; summary: string; canon: BrandOS | null; createdAt: string } | null;
  mega: (MegaPrompt & { version: number }) | null;
  /** Couleur de la marque cliente, tirée de la palette du Brand OS. */
  brandColor: string;
};

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
export type BrandRow = { id: string; name: string; org_id: string; archived_at?: string | null };

/** Active clients (or archived ones). Before migration 0005 nothing can be archived: all are active. */
export async function listBrands(supabase: Supabase, archived: boolean): Promise<BrandRow[]> {
  const query = supabase.from("brands").select("id,name,org_id,archived_at").order("created_at", { ascending: true });
  const { data, error } = await (archived ? query.not("archived_at", "is", null) : query.is("archived_at", null));
  if (isMissingColumn(error)) {
    if (archived) return [];
    const fallback = await supabase.from("brands").select("id,name,org_id").order("created_at", { ascending: true });
    if (fallback.error) throw fallback.error;
    return fallback.data ?? [];
  }
  if (error) throw error;
  return data ?? [];
}

/**
 * Tout ce qu'un écran de l'app doit savoir sur « où on est ».
 * cache() : le layout et la page partagent une seule lecture par requête.
 */
export const getWorkspace = cache(async (): Promise<Workspace> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const brands = await listBrands(supabase, false);

  const wanted = (await cookies()).get(ACTIVE_BRAND_COOKIE)?.value;
  const brand = brands.find((b) => b.id === wanted) ?? brands[0] ?? null;

  let os: Workspace["os"] = null;
  let mega: Workspace["mega"] = null;
  if (brand) {
    const [{ data: osRow }, { data: megaRow }] = await Promise.all([
      supabase
        .from("brand_os_versions")
        .select("version,summary,canon,created_at")
        .eq("brand_id", brand.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("mega_prompts")
        .select("version,content")
        .eq("brand_id", brand.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (osRow) {
      os = {
        version: osRow.version,
        summary: osRow.summary ?? "",
        canon: isBrandOS(osRow.canon) ? osRow.canon : null,
        createdAt: osRow.created_at,
      };
    }
    if (megaRow) mega = { ...normalizeMega(megaRow.content), version: megaRow.version };
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    brands,
    brand,
    os,
    mega,
    brandColor: brandColorFromPalette(os?.canon?.visual.palette),
  };
});
