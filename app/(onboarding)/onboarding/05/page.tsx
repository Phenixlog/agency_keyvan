import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Step } from "@/components/onboarding/Step";
import { Field, Meta, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { SLIDERS } from "@/lib/brand-os/model";
import { getOnboardingBrandOS, requireOnboardingBrand, saveCanonDraft } from "@/lib/onboarding";
import { DEFAULT_SLIDERS, readVoice } from "@/lib/onboarding-answers";

export const dynamic = "force-dynamic";

export default async function OB05() {
  const { brandId } = await requireOnboardingBrand();
  const brand = await getOnboardingBrandOS(brandId);
  if (!brand.canon) redirect("/onboarding/03");
  const { canon } = brand;
  const voice = canon.voice;
  const sliders = voice?.sliders ?? DEFAULT_SLIDERS;

  async function save(formData: FormData) {
    "use server";
    const { brandId } = await requireOnboardingBrand();
    await saveCanonDraft(brandId, (os) => {
      const { tone, ...next } = readVoice(formData, os.voice);
      return { ...os, tone: tone.length ? tone : os.tone, voice: next };
    });
    redirect("/onboarding/06");
  }

  return (
    <Step
      step={5}
      wide
      back="/onboarding/04"
      brandColor={brand.color}
      title="Comment elle parle"
      intro="Les curseurs et les mots sont les garde-fous contre le contenu générique. Brand OS les a réglés d’après ce qu’il a lu : déplacez ce qui ne vous ressemble pas."
    >
      <form action={save} className="grid gap-8">
        <section className="grid gap-4">
          <h2 className="font-display text-h2 font-normal text-ink">Les curseurs</h2>
          <div className="grid gap-3">
            {SLIDERS.map(({ key, left, right }) => (
              <label key={key} className="grid items-center gap-2 rounded-inner bg-soft px-4 py-3 md:grid-cols-[8rem_minmax(0,1fr)_8rem]">
                <span className="text-small font-semibold text-ink">{left}</span>
                <input type="range" name={`s_${key}`} min={1} max={5} step={1} defaultValue={sliders[key]} aria-label={`${left} ou ${right}`} className="w-full accent-ink" />
                <span className="text-small font-semibold text-ink md:text-right">{right}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="grid gap-4">
          <h2 className="font-display text-h2 font-normal text-ink">Les mots</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Ton" hint="Trois à cinq adjectifs, un par ligne.">
              <Textarea name="tone" rows={5} defaultValue={canon.tone.join("\n")} />
            </Field>
            <Field label="Mots qu’on doit pouvoir utiliser" hint="Son vocabulaire. Un par ligne.">
              <Textarea name="must" rows={5} defaultValue={(voice?.must ?? []).join("\n")} />
            </Field>
            <Field label="Mots et sujets interdits" hint="Un par ligne.">
              <Textarea name="forbidden" rows={5} defaultValue={(voice?.forbidden ?? []).join("\n")} />
            </Field>
          </div>
          <fieldset className="flex flex-wrap items-center gap-4">
            <legend className="sr-only">Tutoiement ou vouvoiement</legend>
            <Meta>Elle s’adresse au client en</Meta>
            {(
              [
                ["vous", "vouvoyant"],
                ["tu", "tutoyant"],
                ["", "on verra"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="inline-flex cursor-pointer items-center gap-2 rounded-pill bg-soft px-4 py-2 text-small text-ink has-[:checked]:bg-ink has-[:checked]:text-card">
                <input type="radio" name="address" value={value} defaultChecked={(voice?.address ?? "") === value} className="sr-only" />
                {label}
              </label>
            ))}
          </fieldset>
        </section>

        <section className="grid gap-4">
          <h2 className="font-display text-h2 font-normal text-ink">En exemples</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Elle dirait" hint="Des phrases qu’elle écrirait telles quelles. Une par ligne.">
              <Textarea name="says" rows={4} defaultValue={(voice?.says ?? []).join("\n")} />
            </Field>
            <Field label="Elle ne dirait jamais" hint="Les clichés du secteur, le ton contraire. Une par ligne.">
              <Textarea name="never" rows={4} defaultValue={(voice?.never ?? []).join("\n")} />
            </Field>
            <Field label="On aime" hint="Marques, comptes, liens ou descriptions. Facultatif.">
              <Textarea name="likes" rows={3} defaultValue={(voice?.likes ?? []).join("\n")} />
            </Field>
            <Field label="On déteste" hint="Facultatif, mais précieux.">
              <Textarea name="dislikes" rows={3} defaultValue={(voice?.dislikes ?? []).join("\n")} />
            </Field>
          </div>
        </section>

        <SubmitButton pendingLabel="Enregistrement…" className="justify-self-end">
          Offre et canaux <ArrowRight size={18} strokeWidth={1.75} />
        </SubmitButton>
      </form>
    </Step>
  );
}
