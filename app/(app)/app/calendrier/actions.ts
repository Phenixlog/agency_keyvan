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
import { getWorkspace } from "@/lib/workspace";

const HOME = "/app/calendrier";

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
  const outcome = await suggestCaption({ brandId: brand.id, entryId, brandName: brand.name, summary: os?.summary ?? "", rules: mega?.rules ?? [] });
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
