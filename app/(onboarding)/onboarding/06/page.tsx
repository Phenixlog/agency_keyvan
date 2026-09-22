import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Step } from "@/components/onboarding/Step";
import { Field, Input, Meta, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FORMAT_PRIORITIES, FREQUENCIES } from "@/lib/brand-os/model";
import { CHANNELS } from "@/lib/calendar/model";
import { getOnboardingBrandOS, requireOnboardingBrand, saveCanonDraft } from "@/lib/onboarding";
import { readIdentity, readOffers, readPresence, readVisual } from "@/lib/onboarding-answers";

export const dynamic = "force-dynamic";

const OFFER_SLOTS = [0, 1, 2, 3, 4];
const CHIP = "inline-flex cursor-pointer items-center gap-2 rounded-pill bg-soft px-3 py-1.5 text-small text-ink transition duration-(--duration-fast) ease-cimaise has-[:checked]:bg-ink has-[:checked]:text-card";

/** The analysis writes channels in words ("Instagram"); the calendar keys them. Match loosely. */
const isOn = (values: readonly string[] | undefined, key: string, label: string) =>
  (values ?? []).some((v) => v.toLowerCase() === key || v.toLowerCase() === label.toLowerCase());

export default async function OB06() {
  const { session, brandId } = await requireOnboardingBrand();
  const brand = await getOnboardingBrandOS(brandId);
  if (!brand.canon) redirect("/onboarding/03");
  const { canon } = brand;
  const offers = canon.offers;
  const presence = canon.presence;
  const identity = canon.identity;
  const door = session.data.door ?? "oui";

  async function save(formData: FormData) {
    "use server";
    const { brandId } = await requireOnboardingBrand();
    await saveCanonDraft(brandId, (os) => ({
      ...os,
      offers: readOffers(formData),
      presence: readPresence(formData),
      identity: readIdentity(formData, os.identity),
      visual: readVisual(formData, os.visual),
    }));
    redirect("/onboarding/07");
  }

  return (
    <Step
      step={6}
      wide
      back="/onboarding/05"
      brandColor={brand.color}
      title="Ce qu’on peut dire, et où"
      intro="Les offres et les preuves évitent les claims qui se plantent. Les canaux branchent le calendrier. L’identité visuelle fixe ce que les images doivent respecter."
    >
      <form action={save} className="grid gap-8">
        <section className="grid gap-4">
          <h2 className="font-display text-h2 font-normal text-ink">Offres et preuves</h2>
          <div className="grid gap-2">
            {OFFER_SLOTS.map((i) => {
              const item = offers?.items[i];
              if (!item && i > (offers?.items.length ?? 0)) return null;
              return (
                <div key={i} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                  <Input name={`o${i}_name`} maxLength={80} defaultValue={item?.name ?? ""} placeholder={i === 0 ? "Offre ou produit phare" : "Une autre offre (facultatif)"} aria-label={`Offre ${i + 1} : nom`} />
                  <Input name={`o${i}_line`} maxLength={300} defaultValue={item?.line ?? ""} placeholder="En une ligne" aria-label={`Offre ${i + 1} : description`} />
                </div>
              );
            })}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Preuves" hint="Avis, chiffres, labels, partenaires. Un par ligne, seulement du vrai.">
              <Textarea name="proofs" rows={3} defaultValue={(offers?.proofs ?? []).join("\n")} />
            </Field>
            <Field label="Contraintes légales ou mentions" hint="Alcool, santé, mineurs, promotions… Un par ligne.">
              <Textarea name="legal" rows={3} defaultValue={(offers?.legal ?? []).join("\n")} />
            </Field>
          </div>
          <fieldset className="flex flex-wrap items-center gap-3">
            <legend className="sr-only">Prix affichés publiquement</legend>
            <Meta>Les prix sont affichés publiquement :</Meta>
            {(
              [
                ["oui", "oui"],
                ["non", "non"],
                ["parfois", "parfois"],
                ["", "à voir"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className={CHIP}>
                <input type="radio" name="showPrices" value={value} defaultChecked={(offers?.showPrices ?? "") === value} className="sr-only" />
                {label}
              </label>
            ))}
          </fieldset>
        </section>

        <section className="grid gap-4">
          <h2 className="font-display text-h2 font-normal text-ink">Canaux et formats</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-small font-semibold text-ink">Actifs aujourd’hui</legend>
              <div className="flex flex-wrap gap-2">
                {Object.entries(CHANNELS).map(([key, label]) => (
                  <label key={key} className={CHIP}>
                    <input type="checkbox" name="active" value={key} defaultChecked={isOn(presence?.active, key, label)} className="sr-only" />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-small font-semibold text-ink">À pousser avec vous</legend>
              <div className="flex flex-wrap gap-2">
                {Object.entries(CHANNELS).map(([key, label]) => (
                  <label key={key} className={CHIP}>
                    <input type="checkbox" name="push" value={key} defaultChecked={isOn(presence?.push, key, label)} className="sr-only" />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-small font-semibold text-ink">Formats à savoir sortir en priorité</legend>
            <div className="flex flex-wrap gap-2">
              {FORMAT_PRIORITIES.map((format) => (
                <label key={format} className={CHIP}>
                  <input type="checkbox" name="formats" value={format} defaultChecked={(presence?.formats ?? []).some((f) => f.toLowerCase() === format.toLowerCase())} className="sr-only" />
                  {format}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-small font-semibold text-ink">Fréquence souhaitée</legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(FREQUENCIES).map(([key, label]) => (
                <label key={key} className={CHIP}>
                  <input type="radio" name="frequency" value={key} defaultChecked={presence?.frequency === key} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
            <Meta>Le rythme précis (« 2 par semaine sur Instagram ») se fixe ensuite avec l’expert.</Meta>
          </fieldset>
        </section>

        <section className="grid gap-4">
          <h2 className="font-display text-h2 font-normal text-ink">{door === "non" ? "Ce que les images doivent respecter, pour l’instant" : "L’identité visuelle"}</h2>
          {door === "non" ? (
            <Meta>L’identité sera créée à l’étape suivante du produit (directions, palette, polices, logo). Ce que vous notez ici la guide.</Meta>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Palette" hint="Une couleur par ligne, « nom #RRGGBB ». Sans code, la couleur ne s’affiche pas.">
              <Textarea name="palette" rows={4} defaultValue={canon.visual.palette.join("\n")} />
            </Field>
            <Field label="À éviter dans les images" hint="Un par ligne.">
              <Textarea name="avoid" rows={4} defaultValue={canon.visual.avoid.join("\n")} />
            </Field>
            <Field label="Style d’image">
              <Input name="style" maxLength={300} defaultValue={canon.visual.style} />
            </Field>
            <Field label="Ambiance">
              <Input name="mood" maxLength={300} defaultValue={canon.visual.mood} />
            </Field>
            {door !== "non" ? (
              <>
                <Field label="Polices officielles" hint="Titres, puis texte. « À détecter » si vous ne savez pas.">
                  <div className="grid grid-cols-2 gap-2">
                    <Input name="font_display" maxLength={60} defaultValue={identity?.fonts.display ?? ""} placeholder="Titres" />
                    <Input name="font_body" maxLength={60} defaultValue={identity?.fonts.body ?? ""} placeholder="Texte" />
                  </div>
                </Field>
                <Field label="Non-négociables visuels" hint="« Ne jamais déformer le logo », « pas de fond noir »… Un par ligne.">
                  <Textarea name="nonNegotiables" rows={3} defaultValue={(identity?.nonNegotiables ?? []).join("\n")} />
                </Field>
                <Field label="Ce qui est daté dans l’existant" hint="À ne pas reproduire. Un par ligne.">
                  <Textarea name="dated" rows={3} defaultValue={(identity?.dated ?? []).join("\n")} />
                </Field>
              </>
            ) : (
              <Field label="Contraintes imposées" hint="Couleurs d’une fédération, d’une mairie, d’une franchise… Un par ligne.">
                <Textarea name="nonNegotiables" rows={3} defaultValue={(identity?.nonNegotiables ?? []).join("\n")} />
              </Field>
            )}
          </div>
        </section>

        <SubmitButton pendingLabel="Enregistrement…" className="justify-self-end">
          Voir la fiche <ArrowRight size={18} strokeWidth={1.75} />
        </SubmitButton>
      </form>
    </Step>
  );
}
