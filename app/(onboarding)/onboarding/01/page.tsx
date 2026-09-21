import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Step } from "@/components/onboarding/Step";
import { Field, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createDraftBrand,
  extractUrl,
  getActiveOnboardingSession,
  upsertOnboardingSession,
} from "@/lib/onboarding";
import { getOrCreateDefaultOrgForUser } from "@/lib/orgs";

export const dynamic = "force-dynamic";

export default async function OB01() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const session = await getActiveOnboardingSession(user.id);

  async function start(formData: FormData) {
    "use server";
    const seed = String(formData.get("seed") || "").trim();
    if (!seed) return;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const orgId = await getOrCreateDefaultOrgForUser(user.id, user.email || undefined);
    // Create draft brand if none in session
    const existing = await getActiveOnboardingSession(user.id);
    let brandId = existing?.data?.brand_id as string | undefined;
    if (!brandId && orgId) {
      const brand = await createDraftBrand({ orgId, userId: user.id, seed, url: extractUrl(seed) });
      brandId = brand.id;
    }
    await upsertOnboardingSession({ userId: user.id, orgId: orgId ?? null, seed, brandId: brandId! });
    redirect("/onboarding/02");
  }

  return (
    <Step
      step={1}
      title="Par quoi on commence ?"
      intro="Collez l’adresse du site de la marque, décrivez-la en quelques phrases, ou les deux. Plus la matière est précise, plus le Brand OS sera juste."
    >
      <form action={start} className="grid gap-6">
        <Field label="Site ou description de la marque" hint="Exemple : https://atelier-lune.fr — céramique utilitaire faite main, pour les tables du quotidien.">
          <Textarea name="seed" rows={4} required defaultValue={session?.seed ?? ""} placeholder="https://… et/ou quelques phrases" />
        </Field>
        <SubmitButton pendingLabel="Préparation…" className="justify-self-end">
          Continuer <ArrowRight size={18} strokeWidth={1.75} />
        </SubmitButton>
      </form>
    </Step>
  );
}
