import { redirect } from "next/navigation";
import { ArrowRight, Check, RefreshCw, Sparkles } from "lucide-react";
import { Step } from "@/components/onboarding/Step";
import { Field, Meta, Notice, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { chooseDirection, renderDirections, writeDirections, type RenderedDirection } from "@/lib/identity";
import { isLlmConfigured } from "@/lib/llm/openrouter";
import { getOnboardingBrandOS, requireOnboardingBrand, upsertOnboardingSession } from "@/lib/onboarding";
import { onBrand } from "@/lib/tokens";

export const dynamic = "force-dynamic";

const AMBITIONS = ["Locale et de confiance", "Premium", "Disruptive", "Accessible et familiale", "Autre"] as const;
const SWATCH_WEIGHTS = [4, 3, 2, 2, 1];

/** Google Fonts, loaded only here: the user must see the proposed typefaces for real. */
function fontsHref(directions: RenderedDirection[]): string | null {
  const families = Array.from(new Set(directions.flatMap((d) => [d.fonts.display, d.fonts.body]).filter(Boolean)));
  if (!families.length) return null;
  return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;700`).join("&")}&display=swap`;
}

export default async function OBIdentite() {
  const { session, brandId } = await requireOnboardingBrand();
  const brand = await getOnboardingBrandOS(brandId);
  if (!brand.canon) redirect("/onboarding/03");
  const directions = (session.data.directions ?? []) as RenderedDirection[];
  const chosen = session.data.direction_chosen ?? null;

  async function generate(formData: FormData) {
    "use server";
    const { user, session, brandId } = await requireOnboardingBrand();
    const brand = await getOnboardingBrandOS(brandId);
    const ambition = String(formData.get("ambition") || "").slice(0, 80);
    const references = String(formData.get("references") || "").slice(0, 600);
    const written = await writeDirections({ os: brand.canon, summary: brand.summary, brandName: brand.name, ambition, references });
    const rendered = written.length ? await renderDirections({ brandId, brandName: brand.name, os: brand.canon, directions: written }) : [];
    await upsertOnboardingSession({ userId: user.id, orgId: session.org_id, data: { directions: rendered, direction_chosen: null, identity_brief: { ambition, references } } });
    redirect(rendered.length ? "/onboarding/identite" : "/onboarding/identite?ok=echec");
  }

  async function choose(formData: FormData) {
    "use server";
    const { user, session, brandId } = await requireOnboardingBrand();
    const brand = await getOnboardingBrandOS(brandId);
    const index = Number(formData.get("index"));
    const directions = (session.data.directions ?? []) as RenderedDirection[];
    const direction = directions[index];
    if (!direction) redirect("/onboarding/identite");
    await chooseDirection({ brandId, brandName: brand.name, direction });
    await upsertOnboardingSession({ userId: user.id, orgId: session.org_id, data: { direction_chosen: index } });
    redirect("/onboarding/07");
  }

  const href = fontsHref(directions);

  return (
    <Step
      step={6}
      wide
      back="/onboarding/06"
      brandColor={brand.color}
      title={directions.length ? "Trois directions, un choix" : "Créons l’identité"}
      intro={
        directions.length
          ? "Chaque direction est un parti pris complet : ambiance, palette, polices, logo, système des posts. Choisissez celle qui ressemble le plus à ce que l’entreprise veut devenir. Les logos sont des images, pas des fichiers vectoriels : ils servent à l’écran et aux réseaux."
          : "Comme un graphiste au kickoff : deux questions, puis Brand OS propose trois directions dessinées (palette, polices, logo, moodboard). Comptez une à deux minutes et environ 25 centimes."
      }
    >
      {href ? <link rel="stylesheet" href={href} /> : null}
      {!isLlmConfigured() ? <Notice tone="warning">L’analyse IA n’est pas configurée : impossible de proposer des directions sur ce serveur.</Notice> : null}

      {directions.length ? (
        <div className="grid gap-6">
          <ol className="grid gap-4 lg:grid-cols-3">
            {directions.map((direction, index) => (
              <li key={direction.name} className={`grid content-start gap-4 rounded-card bg-soft p-4 ${chosen === index ? "outline-2 outline-ink" : ""}`}>
                <div className="relative aspect-square overflow-hidden rounded-inner bg-card">
                  {direction.images.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={direction.images.logo} alt={`Logo — ${direction.name}`} className="absolute inset-0 size-full object-contain" />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center font-mono text-meta text-mute">Logo non rendu</span>
                  )}
                </div>
                <div className="grid gap-1">
                  <Meta>Direction {index + 1}</Meta>
                  <h2 className="text-h2 text-ink" style={{ fontFamily: direction.fonts.display ? `"${direction.fonts.display}", serif` : undefined, fontWeight: 700 }}>{direction.name}</h2>
                  <p className="text-small text-ink" style={{ fontFamily: direction.fonts.body ? `"${direction.fonts.body}", sans-serif` : undefined }}>{direction.mood}</p>
                </div>
                <div className="flex h-12 overflow-hidden rounded-inner">
                  {direction.palette.map((color, i) => {
                    const hex = color.match(/#[0-9a-f]{6}\b/i)?.[0] ?? "#888888";
                    return <span key={color} title={color} className="grid place-items-end p-1 font-mono text-[10px]" style={{ flexGrow: SWATCH_WEIGHTS[i] ?? 1, flexBasis: 0, backgroundColor: hex, color: onBrand(hex) }}>{hex}</span>;
                  })}
                </div>
                <Meta>
                  {direction.fonts.display}
                  {direction.fonts.body ? ` / ${direction.fonts.body}` : ""}
                </Meta>
                {direction.images.mood.length ? (
                  <div className="grid grid-cols-2 gap-2">
                    {direction.images.mood.map((src) => (
                      <span key={src} className="relative block aspect-[4/5] overflow-hidden rounded-inner bg-card">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                      </span>
                    ))}
                  </div>
                ) : null}
                <p className="text-small text-mute">{direction.rationale}</p>
                <details>
                  <summary className="cursor-pointer list-none font-mono text-meta text-mute">Le système des posts</summary>
                  <dl className="mt-2 grid gap-1 font-mono text-meta text-mute">
                    <div><dt className="inline">Forme · </dt><dd className="inline text-ink">{direction.graphic.shape}</dd></div>
                    <div><dt className="inline">Stickers · </dt><dd className="inline text-ink">{direction.graphic.stickers}</dd></div>
                    <div><dt className="inline">Titres · </dt><dd className="inline text-ink">{direction.graphic.titles}</dd></div>
                    <div><dt className="inline">Logo · </dt><dd className="inline text-ink">{direction.graphic.logoRule}</dd></div>
                  </dl>
                </details>
                <form action={choose}>
                  <input type="hidden" name="index" value={index} />
                  <SubmitButton pendingLabel="Assets de base en cours… (≈ 40 s)" className="w-full">
                    <Check size={18} strokeWidth={1.75} /> Choisir cette direction
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ol>
          <form action={generate} className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
            <input type="hidden" name="ambition" value={session.data.identity_brief?.ambition ?? ""} />
            <input type="hidden" name="references" value={session.data.identity_brief?.references ?? ""} />
            <Meta>Aucune ne convient ? Trois autres directions coûtent environ 25 centimes.</Meta>
            <SubmitButton variant="soft" pendingLabel="Trois nouvelles directions… (1 à 2 min)">
              <RefreshCw size={16} strokeWidth={1.75} /> Proposer trois autres directions
            </SubmitButton>
          </form>
        </div>
      ) : (
        <form action={generate} className="grid gap-6">
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-small font-semibold text-ink">L’ambition de la marque</legend>
            <div className="flex flex-wrap gap-2">
              {AMBITIONS.map((ambition, i) => (
                <label key={ambition} className="cursor-pointer">
                  <input type="radio" name="ambition" value={ambition} defaultChecked={i === 0} className="peer sr-only" />
                  <span className="inline-flex rounded-pill bg-soft px-4 py-2 text-small text-ink transition duration-(--duration-fast) ease-cimaise peer-checked:bg-ink peer-checked:text-card">{ambition}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Références visuelles" hint="Marques, comptes, images que le client aime, et pourquoi. Une par ligne. Facultatif mais précieux.">
            <Textarea name="references" rows={3} maxLength={600} placeholder="Aesop, pour la sobriété. Le compte @… pour ses couleurs." />
          </Field>
          <SubmitButton pendingLabel="Le directeur artistique travaille… (1 à 2 min)" className="justify-self-end">
            <Sparkles size={18} strokeWidth={1.75} /> Proposer trois directions <ArrowRight size={18} strokeWidth={1.75} />
          </SubmitButton>
        </form>
      )}
    </Step>
  );
}
