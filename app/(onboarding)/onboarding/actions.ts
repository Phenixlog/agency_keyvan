"use server";

import { requireOnboardingBrand, saveBrandLogo, upsertOnboardingSession } from "@/lib/onboarding";

/** Called by the logo uploader once the file is in Storage. Returns a message instead of redirecting. */
export async function registerLogo(storagePath: string): Promise<{ ok: boolean; message: string; url: string | null }> {
  const { user, session, brandId } = await requireOnboardingBrand();
  const { ok, url } = await saveBrandLogo(brandId, storagePath);
  if (!ok || !url) return { ok: false, message: "Logo refusé : PNG, JPG, WebP ou SVG, déposé pour cette marque.", url: null };
  await upsertOnboardingSession({ userId: user.id, orgId: session.org_id, data: { logo: { path: storagePath, url } } });
  return { ok: true, message: "Logo enregistré.", url };
}
