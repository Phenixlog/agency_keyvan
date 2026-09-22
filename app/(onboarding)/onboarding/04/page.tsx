import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Step } from "@/components/onboarding/Step";
import { Field, Input, Meta, Notice, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { OBJECTIVES, SECTORS } from "@/lib/brand-os/model";
import { getOnboardingBrandOS, requireOnboardingBrand, saveCanonDraft } from "@/lib/onboarding";
import { readAudiences, readBusiness } from "@/lib/onboarding-answers";

export const dynamic = "force-dynamic";

const SELECT = "w-full rounded-inner bg-soft px-4 py-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const AUDIENCE_SLOTS = [0, 1, 2];

export default async function OB04() {
  const { brandId } = await requireOnboardingBrand();
  const brand = await getOnboardingBrandOS(brandId);
  if (!brand.canon) redirect("/onboarding/03");
  const { canon } = brand;
  const business = canon.business;
  const audiences = canon.audiences ?? [];

  async function save(formData: FormData) {
    "use server";
    const { brandId } = await requireOnboardingBrand();
    await saveCanonDraft(brandId, (os) => ({
      ...os,
      positioning: String(formData.get("positioning") || "").trim().slice(0, 600) || os.positioning,
      promise: String(formData.get("promise") || "").trim().slice(0, 300) || os.promise,
      business: readBusiness(formData),
      audiences: readAudiences(formData),
    }));
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
          Ce que Brand OS a compris de <em className="highlighter">{brand.name}</em>
        </>
      }
      intro="Tout est prérempli. Corrigez ce qui sonne faux, effacez ce qui est faux, passez le reste. Rien n’est obligatoire ici."
    >
      {canon.generated_by === "fallback" ? (
        <Notice tone="warning">
          Ce brouillon a été produit sans analyse IA. {(canon as { analysis_note?: string | null }).analysis_note ?? ""}{" "}
          <Link href="/onboarding/03" className="font-semibold underline underline-offset-4">Relancer l’analyse</Link>, ou complétez les champs à la main.
        </Notice>
      ) : null}
      <form action={save} className="grid gap-8">
        <section className="grid gap-4">
          <h2 className="font-display text-h2 font-normal text-ink">L’entreprise et son offre</h2>
          <Field label="Positionnement" hint="Pour qui, quoi, en quoi c’est différent.">
            <Textarea name="positioning" rows={2} maxLength={600} defaultValue={canon.positioning} />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Que vend-elle, que fait-elle ?" hint="En une phrase.">
              <Input name="offer" maxLength={300} defaultValue={business?.offer ?? ""} />
            </Field>
            <Field label="La promesse" hint="En une phrase, ce que le client obtient.">
              <Input name="promise" maxLength={300} defaultValue={canon.promise} />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Secteur">
              <select name="sector" defaultValue={SECTORS.includes(business?.sector as (typeof SECTORS)[number]) ? business?.sector : ""} className={SELECT}>
                <option value="">À préciser</option>
                {SECTORS.map((sector) => (
                  <option key={sector} value={sector}>{sector}</option>
                ))}
              </select>
            </Field>
            <Field label="Zone" hint="Ville, région, national, en ligne.">
              <Input name="area" maxLength={80} defaultValue={business?.area ?? ""} />
            </Field>
            <Field label="Objectif n°1 sur 90 jours" hint="Il priorise canaux et formats.">
              <select name="objective" defaultValue={OBJECTIVES.includes(business?.objective as (typeof OBJECTIVES)[number]) ? business?.objective : ""} className={SELECT}>
                <option value="">À décider</option>
                {OBJECTIVES.map((objective) => (
                  <option key={objective} value={objective}>{objective}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Les 3 bénéfices clients qui comptent" hint="Un par ligne. Des bénéfices, pas des fonctionnalités.">
              <Textarea name="benefits" rows={3} defaultValue={(business?.benefits ?? []).join("\n")} />
            </Field>
            <Field label="Si le client ne la choisit pas, il fait quoi ?" hint="Un concurrent, ne rien faire, faire lui-même…">
              <Textarea name="alternative" rows={3} maxLength={300} defaultValue={business?.alternative ?? ""} />
            </Field>
          </div>
        </section>

        <section className="grid gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-h2 font-normal text-ink">Ses publics</h2>
            <Meta>Le premier est le principal. Effacez « Qui » pour retirer un public.</Meta>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {AUDIENCE_SLOTS.map((i) => {
              const audience = audiences[i];
              return (
                <fieldset key={i} className="grid content-start gap-3 rounded-inner bg-soft p-4">
                  <legend className="sr-only">Public {i + 1}</legend>
                  <Meta>{i === 0 ? "Public principal" : `Public ${i + 1}`}</Meta>
                  <Field label="Qui">
                    <Input name={`a${i}_who`} maxLength={300} defaultValue={audience?.who ?? ""} placeholder={i === 0 ? "Urbains 30-45 ans, sensibles à l’artisanat" : "Facultatif"} className="bg-card" />
                  </Field>
                  <Field label="Son désir ou problème">
                    <Input name={`a${i}_desire`} maxLength={300} defaultValue={audience?.desire ?? ""} className="bg-card" />
                  </Field>
                  <Field label="Son objection">
                    <Input name={`a${i}_objection`} maxLength={300} defaultValue={audience?.objection ?? ""} className="bg-card" />
                  </Field>
                  <Field label="La preuve qui le convainc">
                    <Input name={`a${i}_proof`} maxLength={300} defaultValue={audience?.proof ?? ""} className="bg-card" />
                  </Field>
                </fieldset>
              );
            })}
          </div>
        </section>

        <SubmitButton pendingLabel="Enregistrement…" className="justify-self-end">
          La voix <ArrowRight size={18} strokeWidth={1.75} />
        </SubmitButton>
      </form>
    </Step>
  );
}
