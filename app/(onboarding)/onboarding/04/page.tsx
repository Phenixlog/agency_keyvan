import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Step } from "@/components/onboarding/Step";
import { BrandCard, Field, Meta, Notice, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { getOnboardingBrandOS, requireOnboardingBrand, updateOSAndMega } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export default async function OB04() {
  const { brandId } = await requireOnboardingBrand();
  const brand = await getOnboardingBrandOS(brandId);
  if (!brand.summary) redirect("/onboarding/03");

  async function save(formData: FormData) {
    "use server";
    const { brandId } = await requireOnboardingBrand();
    const summary = String(formData.get("summary") || "").trim();
    if (summary) await updateOSAndMega({ brandId, summary });
    redirect("/onboarding/05");
  }

  return (
    <Step
      step={4}
      wide
      back="/onboarding/03"
      brandColor={brand.color}
      title={
        <>
          Voici <em className="highlighter">{brand.name}</em>
        </>
      }
      intro="Relisez, corrigez ce qui sonne faux. Ce texte guide toutes les créations : il l’emporte sur l’analyse d’origine."
    >
      {brand.canon?.generated_by === "fallback" ? (
        <Notice tone="warning">
          Ce brouillon a été produit sans analyse IA : complétez le positionnement, la cible et le ton avant de continuer.
        </Notice>
      ) : null}

      {brand.canon ? (
        <BrandCard>
          <div className="grid gap-6">
            <Meta className="text-on-brand opacity-80">Promesse</Meta>
            <p className="max-w-[28ch] font-display text-h1">{brand.canon.promise}</p>
            <ul className="flex flex-wrap gap-2">
              {brand.canon.tone.map((tone) => (
                <li key={tone} className="rounded-pill bg-on-brand/15 px-4 py-1 text-small">
                  {tone}
                </li>
              ))}
            </ul>
          </div>
        </BrandCard>
      ) : null}

      {brand.canon ? (
        <dl className="grid gap-x-8 md:grid-cols-2">
          <div className="border-t border-line py-4">
            <dt><Meta>Style d’image</Meta></dt>
            <dd className="text-body text-ink">{brand.canon.visual.style}</dd>
          </div>
          <div className="border-t border-line py-4">
            <dt><Meta>Ambiance</Meta></dt>
            <dd className="text-body text-ink">{brand.canon.visual.mood}</dd>
          </div>
          <div className="border-t border-line py-4">
            <dt><Meta>Palette</Meta></dt>
            <dd className="text-body text-ink">{brand.canon.visual.palette.join(" · ") || "à préciser"}</dd>
          </div>
          <div className="border-t border-line py-4">
            <dt><Meta>À éviter</Meta></dt>
            <dd className="text-body text-ink">{brand.canon.visual.avoid.join(" · ") || "rien de particulier"}</dd>
          </div>
        </dl>
      ) : null}

      <form action={save} className="grid gap-6">
        <Field label="Résumé du Brand OS" hint="Une information par ligne. Modifiez librement.">
          <Textarea name="summary" rows={8} defaultValue={brand.summary} />
        </Field>
        <SubmitButton pendingLabel="Enregistrement…" className="justify-self-end">
          C’est juste, continuer <ArrowRight size={18} strokeWidth={1.75} />
        </SubmitButton>
      </form>
    </Step>
  );
}
