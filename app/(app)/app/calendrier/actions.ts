"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  acceptProposals,
  createCalendarShare,
  createEntry,
  deleteEntry,
  discardProposals,
  isValidDay,
  proposeMonth,
  resolveMonth,
  revokeCalendarShares,
  setEntryStatus,
  suggestCaption,
  toDay,
  updateEntry,
} from "@/lib/calendar";
import { queueImageGeneration } from "@/lib/jobs/engine";
import { outImageUrl, type OutPayload } from "@/lib/outs";
import { resolveFormat, type ImageFormat } from "@/lib/brand-os";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

const HOME = "/app/calendrier";
const MAX_INSTRUCTION = 300;

/** Every action works on the workspace's active brand: no brand id travels through a form. */
async function activeBrand() {
  const workspace = await getWorkspace();
  if (!workspace.brand) redirect("/app/clients");
  return { ...workspace, brand: workspace.brand };
}

/** The month to come back to: the one the form was sent from, never an arbitrary string. */
const monthOf = (formData: FormData) => resolveMonth(String(formData.get("mois") || ""), toDay(new Date()));
const back = (month: string, ok?: string, anchor?: string) => `${HOME}?mois=${month}${ok ? `&ok=${ok}` : ""}${anchor ? `#${anchor}` : ""}`;

/**
 * Seen live: redirecting to the address we are already on (same month, only the anchor differs)
 * keeps the stale screen although the database changed. Invalidate the page first, then go.
 */
function done(url: string): never {
  revalidatePath(HOME);
  redirect(url);
}

export async function plan(formData: FormData) {
  const { brand, userId } = await activeBrand();
  const day = String(formData.get("day") || "");
  const outcome = await createEntry({
    brand,
    userId,
    day,
    channel: String(formData.get("channel") || ""),
    outId: String(formData.get("outId") || "") || null,
    caption: String(formData.get("caption") || ""),
  });
  // Land on the month of the new entry, so it is visible.
  done(outcome === "ok" ? back(day.slice(0, 7), "planifie") : `${HOME}?ok=${outcome === "forbidden" ? "refuse" : "invalide"}`);
}

export async function edit(formData: FormData) {
  const { brand } = await activeBrand();
  const day = String(formData.get("day") || "");
  const entryId = String(formData.get("entryId") || "");
  const outcome = await updateEntry({
    brandId: brand.id,
    entryId,
    day,
    channel: String(formData.get("channel") || ""),
    outId: String(formData.get("outId") || "") || null,
    caption: String(formData.get("caption") || ""),
  });
  done(outcome === "ok" && isValidDay(day) ? back(day.slice(0, 7), "modifie", entryId) : back(monthOf(formData), "invalide"));
}

export async function changeStatus(formData: FormData) {
  const { brand } = await activeBrand();
  const entryId = String(formData.get("entryId") || "");
  await setEntryStatus(brand.id, entryId, String(formData.get("status")));
  done(back(monthOf(formData), undefined, entryId));
}

export async function remove(formData: FormData) {
  const { brand } = await activeBrand();
  await deleteEntry(brand.id, String(formData.get("entryId")));
  done(back(monthOf(formData)));
}

export async function writeCaption(formData: FormData) {
  const { brand, os, mega } = await activeBrand();
  const entryId = String(formData.get("entryId") || "");
  const outcome = await suggestCaption({ brandId: brand.id, entryId, brandName: brand.name, summary: os?.summary ?? "", rules: mega?.rules ?? [], canon: os?.canon ?? null });
  done(back(monthOf(formData), outcome === "ok" ? "legende" : "legende-echec", entryId));
}

/** Brand OS fills what the month is missing. Runs inside the action (≈ 20-40 s): callers show a pending SubmitButton. */
export async function propose(formData: FormData) {
  const { brand, userId, os } = await activeBrand();
  const month = monthOf(formData);
  const outcome = await proposeMonth({ brand, userId, month, today: toDay(new Date()), canon: os?.canon ?? null, summary: os?.summary ?? "" });
  const ok = outcome.status === "ok" ? (outcome.source === "llm" ? "propose" : "propose-repli") : `propose-${outcome.status}`;
  done(back(month, ok));
}

export async function accept(formData: FormData) {
  const { brand } = await activeBrand();
  const entryId = String(formData.get("entryId") || "");
  const month = monthOf(formData);
  await acceptProposals(brand.id, entryId ? { entryId } : { month });
  done(back(month, entryId ? undefined : "accepte", entryId || undefined));
}

export async function discard(formData: FormData) {
  const { brand } = await activeBrand();
  const month = monthOf(formData);
  await discardProposals(brand.id, month);
  done(back(month));
}

export async function share(formData: FormData) {
  const { brand, userId } = await activeBrand();
  const outcome = await createCalendarShare({ brandId: brand.id, orgId: brand.org_id, userId });
  done(back(monthOf(formData), outcome === "ok" ? "lien" : "lien-migration", "validation"));
}

export async function unshare(formData: FormData) {
  const { brand } = await activeBrand();
  await revokeCalendarShares(brand.id);
  done(back(monthOf(formData), "lien-coupe", "validation"));
}

/**
 * One change on the visual of a publication, said in plain words, from the day itself (Keyvan: "je ne
 * peux pas modifier une image en langage naturel depuis le calendrier ?"). Same engine as the Studio's
 * retouch: the new image replaces the old one in the slot; the old one stays on the wall.
 */
export async function retouchVisual(formData: FormData) {
  const { brand, userId } = await activeBrand();
  const month = monthOf(formData);
  const entryId = String(formData.get("entryId") || "");
  const instruction = String(formData.get("instruction") || "").trim().slice(0, MAX_INSTRUCTION);
  if (!/^[0-9a-f-]{36}$/i.test(entryId) || !instruction) done(back(month, "invalide", entryId));

  const supabase = await createSupabaseServerClient();
  const { data: entry } = await supabase.from("calendar_entries").select("id,out_id,out:outs(id,payload)").eq("id", entryId).eq("brand_id", brand.id).maybeSingle();
  const out = (Array.isArray(entry?.out) ? entry?.out[0] : entry?.out) as { id: string; payload: OutPayload | null } | null | undefined;
  const source = out ? outImageUrl(out.payload) : null;
  if (!entry || !out || !source) done(back(month, "invalide", entryId));

  const payload = out.payload;
  const format: ImageFormat = payload?.format === "custom" ? "custom" : resolveFormat(payload?.format).key;
  const custom = format === "custom" ? { aspectRatio: payload?.aspect_ratio ?? "", use: (payload?.format_label ?? "").split(" · ")[0] } : null;
  const batchId = crypto.randomUUID();
  await queueImageGeneration({ orgId: brand.org_id, brandId: brand.id, userId, brief: payload?.brief ?? null, format, custom, mode: "retouch", referenceUrl: source, instruction, parentOutId: out.id, batchId });

  const { data: fresh } = await supabase.from("outs").select("id,payload").eq("brand_id", brand.id).order("created_at", { ascending: false }).limit(5);
  const made = (fresh ?? []).find((row) => (row.payload as OutPayload | null)?.batch_id === batchId);
  if (!made) done(back(month, "retouche-echec", entryId));
  const { error } = await supabase.from("calendar_entries").update({ out_id: made.id, client_status: "pending", client_comment: null, client_reviewed_at: null }).eq("id", entryId).eq("brand_id", brand.id);
  if (error) {
    const { error: plain } = await supabase.from("calendar_entries").update({ out_id: made.id }).eq("id", entryId).eq("brand_id", brand.id);
    if (plain) throw plain;
  }
  done(back(month, "retouche", entryId));
}
