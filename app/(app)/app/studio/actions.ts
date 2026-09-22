"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { archiveAsset, getAsset, registerAsset } from "@/lib/assets";
import { OFFERED_FORMATS, resolveFormat, type CustomFormat, type ImageFormat } from "@/lib/brand-os";
import { attachLotToEntry } from "@/lib/calendar";
import { batchFailures, queueBusinessCard, queueImageGeneration, queueProposals, queueSeries } from "@/lib/jobs/engine";
import { CAROUSEL_MAX, LOGO_PLACEMENTS, carouselSlideKind, isTileKind, parseCarouselPlan, parseFeedPlan, parseTilePlan, type LogoPlacement, CARD_FIELDS, parseCardInfo } from "@/lib/tiles";
import { CREATION_AS_REFERENCE, outImageUrl, setOutStatus, type OutPayload, type OutStatus } from "@/lib/outs";
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

/** The user's picks among the brief's questions travel as `q:<id>` fields; they are validated against the brief later. */
function answersFrom(formData: FormData): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (name.startsWith("q:") && typeof value === "string" && value) answers[name.slice(2)] = value.slice(0, 120);
  }
  return answers;
}

/** "Avec texte": the words the user approved, and the kind of tile. Null when the image has no text. */
function tileFrom(formData: FormData) {
  if (String(formData.get("tile_mode") || "") !== "text") return null;
  const kindValue = String(formData.get("tile_kind") || "");
  const placement = String(formData.get("tile_logo_placement") || "");
  const plan = parseTilePlan({
    headline: formData.get("tile_headline"),
    subline: formData.get("tile_subline"),
    caption: formData.get("tile_caption"),
    cta: formData.get("tile_cta"),
    items: String(formData.get("tile_items") || "").split("\n"),
    scene: formData.get("tile_scene"),
    logoPlacement: (LOGO_PLACEMENTS as readonly string[]).includes(placement) ? (placement as LogoPlacement) : "top-left",
  });
  if (!plan) return null;
  return { kind: isTileKind(kindValue) ? kindValue : ("hook_photo" as const), plan, background: "brand" as const };
}

/** The brand's own logo (dropped at onboarding, or read from its site), to be reproduced on tiles. */
async function brandLogo(brandId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("brands").select("data").eq("id", brandId).maybeSingle();
  const d = (data?.data ?? {}) as { logo?: { url?: string }; site?: { logo?: string | null } };
  return d.logo?.url ?? d.site?.logo ?? null;
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

  // "Mettre en situation": an existing creation (a T-shirt artwork…) becomes the reference to reproduce.
  const refOutId = String(formData.get("refOutId") || "");
  let refCreation: string | null = null;
  if (!asset && /^[0-9a-f-]{36}$/i.test(refOutId)) {
    const supabase = await createSupabaseServerClient();
    const { data: out } = await supabase.from("outs").select("payload").eq("id", refOutId).eq("brand_id", brand.id).maybeSingle();
    refCreation = outImageUrl((out?.payload ?? null) as OutPayload | null);
  }

  // A tile with text cannot also restage a reference photo: the words win, the reference is dropped.
  // A business card is its own object: two faces per pair, the details typed here, never a brief-only picture.
  if (requestedFormat(formData).format === "business_card_front") {
    const info = parseCardInfo(Object.fromEntries(CARD_FIELDS.map((f) => [f.key, formData.get(`card_${f.key}`)])));
    if (!info) redirect("/app/studio?erreur=carte");
    const { batchId, jobIds } = await queueBusinessCard({ orgId: brand.org_id, brandId: brand.id, userId, brief, logoUrl: await brandLogo(brand.id) }, info);
    redirect(`/app/studio?lot=${batchId}${await failureParam(jobIds)}`);
  }
  const tile = tileFrom(formData);
  const reference = tile ? null : (asset?.url ?? refCreation);
  const { batchId, jobIds } = await queueProposals({
    orgId: brand.org_id,
    brandId: brand.id,
    userId,
    brief,
    ...requestedFormat(formData),
    answers: answersFrom(formData),
    referenceUrl: reference,
    subject: reference ? (asset?.label ?? CREATION_AS_REFERENCE) : null,
    mode: reference ? "restage" : "describe",
    parentOutId: !tile && refCreation ? refOutId : null,
    tile,
    // The engine decides when the logo travels as a reference (tiles, artworks, mock-ups, custom supports).
    logoUrl: await brandLogo(brand.id),
  });
  // Launched from a calendar day: the lot's first creation takes the slot.
  const entryId = String(formData.get("entry_id") || "");
  const attached = /^[0-9a-f-]{36}$/i.test(entryId) ? await attachLotToEntry({ brandId: brand.id, entryId, batchId }) : "skipped";
  if (attached === "ok") revalidatePath("/app/calendrier");
  redirect(`/app/studio?lot=${batchId}${await failureParam(jobIds)}${attached === "ok" ? "&planifie=1" : ""}`);
}

/**
 * A feed of nine or a carousel, from a plan the user reviewed. The plan comes back from the browser
 * as JSON and is parsed exactly as the model's output would be: nothing unchecked reaches the engine.
 */
/** "&echec=credits" or "&echec=service" when part of the lot failed, so the Studio can say why. */
async function failureParam(jobIds: string[]): Promise<string> {
  const { failed, reason } = await batchFailures(jobIds);
  return failed && reason ? `&echec=${reason}` : "";
}

export async function createSeries(formData: FormData) {
  const { brand, userId } = await activeBrand();
  const series = String(formData.get("series") || "") === "carousel" ? "carousel" : "feed";
  let raw: unknown = null;
  try {
    raw = JSON.parse(String(formData.get("series_plan") || "null"));
  } catch {
    raw = null;
  }
  const { format } = requestedFormat(formData);
  const tiles =
    series === "feed"
      ? parseFeedPlan({ tiles: raw }).map((t) => ({ kind: t.kind, background: t.background, plan: t }))
      : parseCarouselPlan({ slides: raw }, Array.isArray(raw) ? Math.min(raw.length, CAROUSEL_MAX) : 5).map((plan, i, all) => ({ kind: carouselSlideKind(i, all.length), background: "brand" as const, plan }));
  if (!tiles.length) redirect("/app/studio");
  const { batchId, jobIds } = await queueSeries({ orgId: brand.org_id, brandId: brand.id, userId, brief: null, format, logoUrl: await brandLogo(brand.id) }, tiles, series);
  redirect(`/app/studio?lot=${batchId}${series === "feed" ? "&vue=feed" : ""}${await failureParam(jobIds)}`);
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
  const { jobId } = await queueImageGeneration({
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
  redirect(`/app/studio?lot=${batchId}${await failureParam([jobId])}`);
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
