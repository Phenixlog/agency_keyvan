"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { applyExpertProposal } from "@/lib/brands";
import { archiveConversation, parseProposal, renameConversation, setProposalState } from "@/lib/expert";
import { getWorkspace } from "@/lib/workspace";

export type ApplyResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * The proposal comes back from the browser, so it is re-validated here exactly as when it came
 * from the model; the brand is the workspace's active brand, never an id from the client.
 */
export async function applyProposal(rawProposal: unknown, messageId: string | null): Promise<ApplyResult> {
  const { brand, userId } = await getWorkspace();
  if (!brand) return { ok: false, message: "Aucune marque active." };
  const proposal = parseProposal(rawProposal);
  if (!proposal) return { ok: false, message: "Proposition illisible : demandez à l’expert de la reformuler." };

  const result = await applyExpertProposal({ brandId: brand.id, orgId: brand.org_id, userId, proposal });
  if (result.status === "no-brand-os") {
    return { ok: false, message: "Cette marque n’a pas de Brand OS structuré : relancez l’analyse depuis l’écran Marque." };
  }
  const versions = result.status === "applied" ? { os: result.osVersion, mega: result.megaVersion } : { os: null, mega: null };
  if (messageId) await setProposalState(brand.id, messageId, "applied", versions);
  // The palette may have changed, and with it the colour of the whole workspace.
  revalidatePath("/app", "layout");
  if (result.status !== "applied") return { ok: true, message: "Rien à changer : la marque est déjà dans cet état." };

  const label = [result.osVersion ? `Brand OS v${result.osVersion}` : null, result.megaVersion ? `mega-prompt v${result.megaVersion}` : null]
    .filter(Boolean)
    .join(" · ");
  return { ok: true, message: `Appliqué : ${label}. Toutes les prochaines créations en tiennent compte.` };
}

export async function dismissProposal(messageId: string | null): Promise<void> {
  const { brand } = await getWorkspace();
  if (brand && messageId) await setProposalState(brand.id, messageId, "dismissed");
  revalidatePath("/app/expert");
}

export async function rename(formData: FormData) {
  const { brand } = await getWorkspace();
  const id = String(formData.get("conversationId") || "");
  if (brand) await renameConversation(brand.id, id, String(formData.get("title") || ""));
  revalidatePath("/app/expert");
  redirect(`/app/expert?c=${encodeURIComponent(id)}`);
}

export async function archive(formData: FormData) {
  const { brand } = await getWorkspace();
  if (brand) await archiveConversation(brand.id, String(formData.get("conversationId") || ""));
  revalidatePath("/app/expert");
  redirect("/app/expert");
}
