import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { RefreshCw, X } from "lucide-react";
import { BrandCard, ButtonLink, Card, CardHeader, Empty, Field, Meta, Notice, Textarea, VersionTag } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { rebuildBrandOS, removeRule, saveBrandSummary, setBrandColor } from "@/lib/brands";
import { isLlmConfigured } from "@/lib/llm/openrouter";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const MAX_RULES = 12;
const MAX_EXTRA = 4000;
const HISTORY = 6;
const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const NOTICES = {
  resume: ["success", "Nouvelle version du Brand OS enregistrée."],
  couleur: ["success", "Couleur de marque mise à jour : l’atelier s’est reteinté."],
  regle: ["success", "Règle retirée. Elle ne s’appliquera plus aux prochaines créations."],
  analyse: ["success", "Analyse relancée : un nouveau Brand OS est en place. Vos règles apprises sont conservées."],
  "analyse-echec": ["danger", "L’analyse n’a pas abouti : le Brand OS actuel est conservé. Réessayez dans un instant."],
} as const;

export default async function MarquePage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { brand, os, mega, brandColor } = await getWorkspace();
  const { ok } = await searchParams;

  if (!brand) {
    return (
      <Empty title="Aucune marque pour l’instant" action={<ButtonLink href="/onboarding">Analyser une marque</ButtonLink>}>
        Le Brand OS d’une marque — positionnement, ton, direction visuelle — s’affiche et se corrige ici.
      </Empty>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: versions } = await supabase
    .from("brand_os_versions")
    .select("version,created_at,canon")
    .eq("brand_id", brand.id)
    .order("version", { ascending: false })
    .limit(HISTORY);

  async function saveSummary(formData: FormData) {
    "use server";
    const { brand, userId } = await getWorkspace();
    if (!brand) redirect("/app");
    const summary = String(formData.get("summary") || "").trim();
    if (!summary) return;
    await saveBrandSummary({ brandId: brand.id, orgId: brand.org_id, userId, summary });
    redirect("/app/marque?ok=resume");
  }

  async function saveColor(formData: FormData) {
    "use server";
    const { brand, userId } = await getWorkspace();
    if (!brand) redirect("/app");
    await setBrandColor({ brandId: brand.id, orgId: brand.org_id, userId, hex: String(formData.get("hex") || "") });
    // The brand colour lives on the app layout, which a same-segment redirect does not re-render.
    revalidatePath("/app", "layout");
    redirect("/app/marque?ok=couleur");
  }

  async function dropRule(formData: FormData) {
    "use server";
    const { brand, userId } = await getWorkspace();
    if (!brand) redirect("/app");
    await removeRule({ brandId: brand.id, orgId: brand.org_id, userId, rule: String(formData.get("rule") || "") });
    redirect("/app/marque?ok=regle");
  }

  async function rebuild(formData: FormData) {
    "use server";
    const { brand, userId } = await getWorkspace();
    if (!brand) redirect("/app");
    const extra = String(formData.get("extra") || "").slice(0, MAX_EXTRA);
    const outcome = await rebuildBrandOS({ brandId: brand.id, orgId: brand.org_id, userId, extra });
    revalidatePath("/app", "layout"); // a new analysis may change the palette, hence the brand colour
    redirect(outcome === "llm" ? "/app/marque?ok=analyse" : "/app/marque?ok=analyse-echec");
  }

  const canon = os?.canon;
  const rules = mega?.rules ?? [];
  const notice = ok && ok in NOTICES ? NOTICES[ok as keyof typeof NOTICES] : null;
  const llmReady = isLlmConfigured();
  const isDraft = (versions?.[0]?.canon as { generated_by?: string } | null)?.generated_by === "fallback";

  return (
    <>
      <header>
        <Meta>Marque · Brand OS {os ? `v${os.version}` : "à construire"}</Meta>
        <h1 className="mt-2 font-display text-display text-ink">
          <em className="highlighter">{brand.name}</em>
        </h1>
      </header>

      {notice ? <Notice tone={notice[0]}>{notice[1]}</Notice> : null}
      {isDraft ? (
        <Notice tone="warning">
          Ce Brand OS est un brouillon produit sans analyse IA. {llmReady ? "Relancez l’analyse en bas de page pour obtenir la version complète." : "Configurez OPENROUTER_API_KEY sur le serveur, puis relancez l’analyse."}
        </Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-12">
        <BrandCard className="lg:col-span-7">
          <div className="grid min-h-56 content-between gap-6">
            <span className="font-mono text-meta opacity-80">Promesse</span>
            <p className="max-w-[26ch] font-display text-h1">{canon?.promise || os?.summary.split("\n")[0] || "À définir"}</p>
            {canon?.tone.length ? (
              <ul className="flex flex-wrap gap-2">
                {canon.tone.map((tone) => (
                  <li key={tone} className="rounded-pill bg-on-brand/15 px-4 py-1 text-small">
                    {tone}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </BrandCard>

        <Card className="lg:col-span-5">
          <CardHeader title="Identité" />
          <dl className="grid">
            {[
              ["Positionnement", canon?.positioning],
              ["Cible", canon?.audience],
              ["Piliers éditoriaux", canon?.pillars.join(" · ")],
            ].map(([term, value]) => (
              <div key={term} className="border-t border-line py-3 first:border-t-0 first:pt-0">
                <dt><Meta>{term}</Meta></dt>
                <dd className="text-body text-ink">{value || "À préciser"}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader title="Direction visuelle" aside={<Meta>guide chaque image créée</Meta>} />
          <dl className="grid gap-x-8 md:grid-cols-2">
            {[
              ["Style d’image", canon?.visual.style],
              ["Ambiance", canon?.visual.mood],
              ["Palette", canon?.visual.palette.join(" · ")],
              ["À éviter", canon?.visual.avoid.join(" · ")],
            ].map(([term, value]) => (
              <div key={term} className="border-t border-line py-3">
                <dt><Meta>{term}</Meta></dt>
                <dd className="text-body text-ink">{value || "À préciser"}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="lg:col-span-12">
          <CardHeader
            title="Stratégie"
            aside={
              <ButtonLink href="/app/expert" variant="ghost">
                En parler à l’expert
              </ButtonLink>
            }
          />
          {canon?.strategy ? (
            <dl className="grid gap-x-8 md:grid-cols-2">
              {[
                ["Objectifs", canon.strategy.objectives.join(" · ")],
                ["Canaux", canon.strategy.channels.join(" · ")],
                ["Angles", canon.strategy.angles.join(" · ")],
                ["Rythme", canon.strategy.rhythm],
              ].map(([term, value]) => (
                <div key={term} className="border-t border-line py-3">
                  <dt><Meta>{term}</Meta></dt>
                  <dd className="text-body text-ink">{value || "À préciser"}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-small text-mute">
              Pas encore de stratégie posée. Elle se décide en discutant avec l’expert : objectifs, canaux, angles, rythme.
            </p>
          )}
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader title="Couleur de la marque" aside={<Meta>{brandColor}</Meta>} />
          <p className="text-small text-mute">
            C’est elle qui teinte l’atelier quand cette marque est active. Elle passe aussi en tête de palette pour les
            créations.
          </p>
          {canon ? (
            <form action={saveColor} className="mt-4 flex items-center gap-4">
              <input
                type="color"
                name="hex"
                defaultValue={brandColor}
                aria-label="Couleur de la marque"
                className="size-12 cursor-pointer rounded-inner border-0 bg-transparent p-0"
              />
              <SubmitButton variant="soft" pendingLabel="…">Appliquer</SubmitButton>
            </form>
          ) : (
            <p className="mt-4 text-small text-mute">Disponible dès que le Brand OS est analysé.</p>
          )}
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader title="Résumé" aside={<Meta>l’emporte sur l’analyse en cas de conflit</Meta>} />
          <form action={saveSummary} className="grid gap-4">
            <Field label="Texte de référence" hint="Une information par ligne. Chaque enregistrement crée une nouvelle version ; les règles apprises ne bougent pas.">
              <Textarea name="summary" rows={9} defaultValue={os?.summary ?? ""} />
            </Field>
            <SubmitButton variant="soft" pendingLabel="Enregistrement…" className="justify-self-start">
              Enregistrer une nouvelle version
            </SubmitButton>
          </form>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader
            title="Ce que l’atelier a appris"
            aside={
              <span className="flex items-center gap-2">
                {mega ? <VersionTag v={mega.version} /> : null}
                <Meta>
                  {rules.length} / {MAX_RULES}
                </Meta>
              </span>
            }
          />
          {rules.length ? (
            <ul>
              {rules.map((rule) => (
                <li key={rule} className="flex items-start justify-between gap-4 border-t border-line py-3 first:border-t-0 first:pt-0">
                  <span className="text-body text-ink">{rule}</span>
                  <form action={dropRule}>
                    <input type="hidden" name="rule" value={rule} />
                    <button
                      type="submit"
                      aria-label={`Retirer la règle : ${rule}`}
                      title="Retirer cette règle"
                      className="grid size-8 flex-none place-items-center rounded-pill text-mute transition duration-(--duration-fast) ease-cimaise hover:bg-danger-tint hover:text-danger"
                    >
                      <X size={16} strokeWidth={1.75} />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-small text-mute">
              Aucune règle. Elles naissent de vos remarques dans le Studio et s’appliquent à toutes les créations suivantes.
            </p>
          )}
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader title="Relancer l’analyse" />
          <form action={rebuild} className="grid gap-4">
            <Field
              label="Matière supplémentaire"
              hint="Facultatif : nouveau texte de présentation, manifeste, brief client… Le site est relu, votre résumé actuel est respecté, vos règles sont conservées."
            >
              <Textarea name="extra" rows={4} maxLength={MAX_EXTRA} disabled={!llmReady} />
            </Field>
            {llmReady ? (
              <SubmitButton pendingLabel="Analyse en cours… (≈ 20 s)" className="justify-self-start">
                <RefreshCw size={18} strokeWidth={1.75} /> Relancer l’analyse
              </SubmitButton>
            ) : (
              <Notice tone="warning">Analyse IA non configurée sur ce serveur (OPENROUTER_API_KEY manquante).</Notice>
            )}
          </form>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader title="Historique" />
          <ol>
            {(versions ?? []).map((version) => (
              <li key={version.version} className="flex items-center justify-between gap-4 border-t border-line py-3 first:border-t-0 first:pt-0">
                <span className="flex items-center gap-2">
                  <VersionTag v={version.version} />
                  <span className="text-small text-ink">Brand OS</span>
                </span>
                <Meta>{DATE.format(new Date(version.created_at))}</Meta>
              </li>
            ))}
            {(mega?.changelog ?? []).slice(-HISTORY).reverse().map((entry) => (
              <li key={`${entry.v}-${entry.at}`} className="flex items-start justify-between gap-4 border-t border-line py-3">
                <span className="text-small text-mute">{entry.note}</span>
                <Meta className="whitespace-nowrap">{DATE.format(new Date(entry.at))}</Meta>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
