import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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

  const { data: brandRows } = await supabase
    .from("brands")
    .select("id,name,org_id")
    .order("created_at", { ascending: true });
  const brands = brandRows ?? [];

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
