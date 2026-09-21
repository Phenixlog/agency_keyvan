"use server";

import { redirect } from "next/navigation";
import { archiveAsset, getAsset, registerAsset } from "@/lib/assets";
import { OFFERED_FORMATS, resolveFormat, type CustomFormat, type ImageFormat } from "@/lib/brand-os";
import { queueImageGeneration, queueProposals } from "@/lib/jobs/engine";
import { outImageUrl, setOutStatus, type OutPayload, type OutStatus } from "@/lib/outs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

const MAX_BRIEF = 800;
const MAX_INSTRUCTION = 300;

/** Every action works on the workspace's active brand: no brand id travels through a form. */
async function activeBrand() {
  const { brand, userId } = await getWorkspace();
  if (!brand) redirect("/app/clients");
  return { brand, userId };
}

/** A catalogue format, or "custom" with the ratio and the medium the user described. Anything else falls back to the square post. */
function requestedFormat(formData: FormData): { format: ImageFormat; custom: CustomFormat | null } {
  const key = String(formData.get("format") || "");
  if (key === "custom") {
    return { format: "custom", custom: { aspectRatio: String(formData.get("customRatio") || ""), use: String(formData.get("customUse") || "") } };
  }
  return { format: (OFFERED_FORMATS as string[]).includes(key) ? (key as ImageFormat) : "social_square", custom: null };
}

/**
 * Three proposals for one brief — from words, or from a photo of the client's real product.
 * Generation runs inside the action (≈ 30 s): callers show a pending SubmitButton.
 */
export async function createProposals(formData: FormData) {
  const { brand, userId } = await activeBrand();
  const brief = String(formData.get("brief") || "").trim().slice(0, MAX_BRIEF);
  const assetId = String(formData.get("assetId") || "");
  const asset = assetId ? await getAsset(brand.id, assetId) : null;

  const { batchId } = await queueProposals({
    orgId: brand.org_id,
    brandId: brand.id,
    userId,
    brief,
    ...requestedFormat(formData),
    referenceUrl: asset?.url ?? null,
    subject: asset?.label ?? null,
    mode: asset ? "restage" : "describe",
  });
  redirect(`/app/studio?lot=${batchId}`);
}

/** One change on one creation. The brand is untouched: that is what the expert is for. */
export async function retouch(formData: FormData) {
  const { brand, userId } = await activeBrand();
  const instruction = String(formData.get("instruction") || "").trim().slice(0, MAX_INSTRUCTION);
  const outId = String(formData.get("outId") || "");
  if (!instruction || !outId) redirect("/app/studio");

  const supabase = await createSupabaseServerClient();
  const { data: out } = await supabase.from("outs").select("id,payload").eq("id", outId).eq("brand_id", brand.id).maybeSingle();
  const payload = (out?.payload ?? null) as OutPayload | null;
  const source = outImageUrl(payload);
  if (!out || !source) redirect("/app/studio");

  // Same format as the image being fixed — including a custom one, rebuilt from what was stored with it.
  const format: ImageFormat = payload?.format === "custom" ? "custom" : resolveFormat(payload?.format).key;
  const custom = format === "custom" ? { aspectRatio: payload?.aspect_ratio ?? "", use: (payload?.format_label ?? "").split(" · ")[0] } : null;
  const batchId = crypto.randomUUID();
  await queueImageGeneration({
    orgId: brand.org_id,
    brandId: brand.id,
    userId,
    brief: payload?.brief ?? null,
    format,
    custom,
    mode: "retouch",
    referenceUrl: source,
    instruction,
    parentOutId: out.id as string,
    batchId,
  });
  redirect(`/app/studio?lot=${batchId}`);
}

export async function setStatus(formData: FormData) {
  await activeBrand();
  const status = String(formData.get("status")) as OutStatus;
  if (["draft", "ready", "archived"].includes(status)) await setOutStatus(String(formData.get("outId")), status);
  // `back` comes from a hidden field: only ever return to the Studio, never to an arbitrary URL.
  const back = String(formData.get("back") || "");
  redirect(back.startsWith("/app/studio") ? back : "/app/studio");
}

/** Called by the uploader once the file is in Storage. Returns a message instead of redirecting. */
export async function addAsset(storagePath: string, label: string, kind: string): Promise<{ ok: boolean; message: string }> {
  const { brand, userId } = await activeBrand();
  const outcome = await registerAsset({ brand, userId, storagePath, label, kind });
  if (outcome === "ok") return { ok: true, message: "Photo ajoutée à la photothèque." };
  if (outcome === "migration-needed") {
    return { ok: false, message: "La photothèque attend une mise à jour de la base : exécutez supabase/migrations/0007_brand_assets.sql dans Supabase → SQL Editor." };
  }
  return { ok: false, message: "Photo refusée : donnez-lui un nom, et utilisez un fichier JPG, PNG ou WebP." };
}

export async function removeAsset(formData: FormData) {
  const { brand } = await activeBrand();
  await archiveAsset(brand.id, String(formData.get("assetId") || ""));
  redirect("/app/studio?vue=phototheque");
}
