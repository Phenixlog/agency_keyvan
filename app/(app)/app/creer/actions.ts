"use server";

import { redirect } from "next/navigation";
import { IMAGE_FORMATS, type ImageFormat } from "@/lib/brand-os";
import { queueImageGeneration } from "@/lib/jobs/engine";
import { getWorkspace } from "@/lib/workspace";

const MAX_BRIEF = 800;

/**
 * Used by the Créer screen and by the quick form on the client's home.
 * Generation runs inside the action (10-25 s): callers show a pending SubmitButton.
 */
export async function launchGeneration(formData: FormData) {
  const { brand, userId } = await getWorkspace();
  if (!brand) redirect("/app/clients");
  const requested = String(formData.get("format") || "");
  const format: ImageFormat = requested in IMAGE_FORMATS ? (requested as ImageFormat) : "social_square";
  const brief = String(formData.get("brief") || "").trim().slice(0, MAX_BRIEF);
  const { jobId } = await queueImageGeneration({ orgId: brand.org_id, brandId: brand.id, userId, brief, format });
  redirect(`/app/creer?job=${jobId}`);
}
