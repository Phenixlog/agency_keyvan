"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { renameBrand, setBrandArchived } from "@/lib/brands";
import { ACTIVE_BRAND_COOKIE, getWorkspace } from "@/lib/workspace";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Enter a client's workshop. The id must be one of the caller's own active clients. */
export async function openClient(formData: FormData) {
  const { brands } = await getWorkspace();
  const id = String(formData.get("brandId") || "");
  if (!brands.some((b) => b.id === id)) redirect("/app/clients");
  (await cookies()).set(ACTIVE_BRAND_COOKIE, id, { path: "/", maxAge: ONE_YEAR_SECONDS, sameSite: "lax" });
  revalidatePath("/app", "layout");
  redirect("/app");
}

export async function renameClient(formData: FormData) {
  const { brands } = await getWorkspace();
  const id = String(formData.get("brandId") || "");
  if (brands.some((b) => b.id === id)) await renameBrand(id, String(formData.get("name") || ""));
  revalidatePath("/app", "layout");
  redirect("/app/clients");
}

export async function archiveClient(formData: FormData) {
  const { brands } = await getWorkspace();
  const id = String(formData.get("brandId") || "");
  const outcome = brands.some((b) => b.id === id) ? await setBrandArchived(id, true) : "ok";
  revalidatePath("/app", "layout");
  redirect(outcome === "migration-needed" ? "/app/clients?etat=migration" : "/app/clients?etat=archive");
}

export async function restoreClient(formData: FormData) {
  await getWorkspace(); // authenticated; RLS scopes the update to the caller's organisations
  await setBrandArchived(String(formData.get("brandId") || ""), false);
  revalidatePath("/app", "layout");
  redirect("/app/clients");
}
