"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { inviteMember, removeMember } from "@/lib/team";
import { getWorkspace } from "@/lib/workspace";

/** Where the invitation link must come back: this deployment, never a hard-coded host. */
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function invite(formData: FormData) {
  const { userId, email } = await getWorkspace();
  const result = await inviteMember({ by: { id: userId, email }, email: String(formData.get("email") || ""), origin: await origin() });
  revalidatePath("/app/equipe");
  redirect(`/app/equipe?${result.ok ? "ok" : "erreur"}=${encodeURIComponent(result.message)}`);
}

export async function remove(formData: FormData) {
  const { userId, email } = await getWorkspace();
  const result = await removeMember({ by: { id: userId, email }, userId: String(formData.get("userId") || "") });
  revalidatePath("/app/equipe");
  redirect(`/app/equipe?${result.ok ? "ok" : "erreur"}=${encodeURIComponent(result.message)}`);
}
