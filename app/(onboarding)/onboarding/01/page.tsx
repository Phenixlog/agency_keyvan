import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Step } from "@/components/onboarding/Step";
import { Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDraftBrand, extractUrl, getActiveOnboardingSession, upsertOnboardingSession, type Door } from "@/lib/onboarding";
import { getOrCreateDefaultOrgForUser } from "@/lib/orgs";

export const dynamic = "force-dynamic";

const DOORS: { value: Door; label: string; detail: string }[] = [
  { value: "oui", label: "Oui, une identité utilisable", detail: "Logo et couleurs au minimum. On part de l’existant, on ne recrée rien." },
  { value: "logo", label: "Un logo seul, sans règles", detail: "On garde le logo, on construit le reste autour." },
  { value: "non", label: "Non, ou trop flou", detail: "On crée l’identité : directions, palette, polices, logo. Comme un graphiste au kickoff." },
];

export default async function OB01() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const session = await getActiveOnboardingSession(user.id);
  // Adding a second client must be escapable; a first-time user has nowhere to go back to.
  const { count: clients } = await supabase.from("brands").select("id", { count: "exact", head: true });

  async function start(formData: FormData) {
    "use server";
    const seed = String(formData.get("seed") || "").trim().slice(0, 4000);
    const internalName = String(formData.get("internal_name") || "").trim().slice(0, 80);
    const displayName = String(formData.get("display_name") || "").trim().slice(0, 80) || internalName;
    const doorValue = String(formData.get("door") || "");
    const door: Door = doorValue === "oui" || doorValue === "logo" || doorValue === "non" ? doorValue : "oui";
    if (!seed || !internalName) return;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const orgId = await getOrCreateDefaultOrgForUser(user.id, user.email || undefined);
    const existing = await getActiveOnboardingSession(user.id);
    let brandId = existing?.data?.brand_id;
    if (!brandId && orgId) {
      const brand = await createDraftBrand({ orgId, userId: user.id, seed, url: extractUrl(seed), name: displayName });
      brandId = brand.id;
    } else if (brandId) {
      await supabase.from("brands").update({ name: displayName }).eq("id", brandId);
    }
    await upsertOnboardingSession({ userId: user.id, orgId: orgId ?? null, seed, data: { brand_id: brandId!, door, internal_name: internalName, display_name: displayName } });
    redirect("/onboarding/02");
  }

  return (
    <Step
      step={1}
      back={(clients ?? 0) > 0 ? "/app/clients" : undefined}
      backLabel="Retour à mes clients"
      title="Un nouveau client"
      intro="Trois choses, et Brand OS fait le reste : il lit, il comprend, il préremplit. Vous corrigerez ce qui sonne faux, vous ne remplirez pas de formulaire."
    >
      <form action={start} className="grid gap-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nom du client" hint="Pour vous, dans l’atelier.">
            <Input name="internal_name" required maxLength={80} defaultValue={session?.data?.internal_name ?? ""} placeholder="Atelier Lune" />
          </Field>
          <Field label="Nom commercial affiché" hint="S’il diffère. Sinon laissez vide.">
            <Input name="display_name" maxLength={80} defaultValue={session?.data?.display_name && session.data.display_name !== session.data.internal_name ? session.data.display_name : ""} placeholder="Atelier Lune — Céramique" />
          </Field>
        </div>

        <fieldset className="grid gap-2">
          <legend className="mb-2 text-small font-semibold text-ink">Ce client a-t-il déjà une identité visuelle utilisable ?</legend>
          {DOORS.map((door) => (
            <label key={door.value} className="flex cursor-pointer items-start gap-3 rounded-inner bg-soft p-4 transition duration-(--duration-fast) ease-cimaise has-[:checked]:bg-tint has-[:checked]:outline-2 has-[:checked]:outline-ink">
              <input type="radio" name="door" value={door.value} defaultChecked={(session?.data?.door ?? "oui") === door.value} className="mt-1 accent-ink" />
              <span className="grid gap-0.5">
                <span className="text-title text-ink">{door.label}</span>
                <span className="text-small text-mute">{door.detail}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <Field label="Site, réseaux, ou description" hint="Collez l’adresse du site (Brand OS le lit), et/ou décrivez l’entreprise en quelques phrases : ce qu’elle fait, pour qui, où.">
          <Textarea name="seed" rows={4} required defaultValue={session?.seed ?? ""} placeholder="https://… et/ou quelques phrases" />
        </Field>
        <SubmitButton pendingLabel="Préparation…" className="justify-self-end">
          Continuer <ArrowRight size={18} strokeWidth={1.75} />
        </SubmitButton>
      </form>
    </Step>
  );
}
