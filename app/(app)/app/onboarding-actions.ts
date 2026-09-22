"use server";

import { redirect } from "next/navigation";
import { resumeOnboardingFor } from "@/lib/onboarding";
import { getWorkspace } from "@/lib/workspace";

/** A client created before the gate, or left mid-onboarding: back to its validation screen. */
export async function resumeOnboarding() {
  const { brand, userId } = await getWorkspace();
  if (!brand) redirect("/app/clients");
  const ok = await resumeOnboardingFor({ userId, orgId: brand.org_id, brandId: brand.id });
  redirect(ok ? "/onboarding/07" : "/app/marque");
}
