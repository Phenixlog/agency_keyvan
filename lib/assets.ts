import { isForbidden, isMissingTable } from "@/lib/db-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * La photothèque d'un client : ses vrais produits, lieux et personnes. Une création peut partir
 * d'une de ces photos — le modèle garde le sujet tel quel et change la scène autour.
 */

export const ASSET_KINDS = { product: "Produit", place: "Lieu", people: "Personnes", other: "Autre" } as const;
export type AssetKind = keyof typeof ASSET_KINDS;

export type BrandAsset = { id: string; label: string; kind: AssetKind; url: string; storagePath: string };

const MAX_LABEL = 80;
const BUCKET = "outs";

export function referencesPrefix(brandId: string): string {
  return `brands/${brandId}/references/`;
}

export function assetPublicUrl(storagePath: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

/** `null`: the table is not there yet (migration 0007 pending). */
export async function listAssets(brandId: string): Promise<BrandAsset[] | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("brand_assets")
    .select("id,label,kind,storage_path")
    .eq("brand_id", brandId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (isMissingTable(error)) return null;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    label: row.label as string,
    kind: row.kind as AssetKind,
    storagePath: row.storage_path as string,
    url: assetPublicUrl(row.storage_path as string),
  }));
}

export async function getAsset(brandId: string, assetId: string): Promise<BrandAsset | null> {
  return (await listAssets(brandId))?.find((asset) => asset.id === assetId) ?? null;
}

/**
 * The file was uploaded by the browser straight to Storage; this records what it shows.
 * The path is checked against the ACTIVE brand's folder: a client cannot register a file elsewhere.
 */
export async function registerAsset(args: {
  brand: { id: string; org_id: string };
  userId: string;
  storagePath: string;
  label: string;
  kind: string;
}): Promise<"ok" | "invalid" | "migration-needed"> {
  const label = args.label.trim().replace(/\s+/g, " ").slice(0, MAX_LABEL);
  const inFolder = args.storagePath.startsWith(referencesPrefix(args.brand.id)) && /^[\w./-]+\.(jpe?g|png|webp)$/i.test(args.storagePath) && !args.storagePath.includes("..");
  if (!label || !inFolder || !(args.kind in ASSET_KINDS)) return "invalid";

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("brand_assets").insert({
    org_id: args.brand.org_id,
    brand_id: args.brand.id,
    storage_path: args.storagePath,
    label,
    kind: args.kind,
    created_by: args.userId,
  });
  if (isMissingTable(error) || isForbidden(error)) return "migration-needed";
  if (error) throw error;
  return "ok";
}

/** Archived, never deleted: creations made from a photo keep pointing at it. */
export async function archiveAsset(brandId: string, assetId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("brand_assets").update({ archived_at: new Date().toISOString() }).eq("id", assetId).eq("brand_id", brandId);
  if (error && !isMissingTable(error)) throw error;
}
