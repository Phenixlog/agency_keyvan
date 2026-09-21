import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ExternalLink, History, Link2, Link2Off, RefreshCw, X } from "lucide-react";
import { BrandBoard } from "@/components/brand/BrandBoard";
import { CopyLink, PrintButton } from "@/components/brand/BoardActions";
import { ButtonLink, Card, CardHeader, Empty, Field, Meta, Notice, Textarea, VersionTag } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { loadBoard } from "@/lib/brand-board";
import {
  createBrandShare,
  getBrandShare,
  rebuildBrandOS,
  removeRule,
  restoreBrandOSVersion,
  restoreMegaVersion,
  revokeBrandShares,
  setBrandColor,
} from "@/lib/brands";
import { isLlmConfigured } from "@/lib/llm/openrouter";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const MAX_RULES = 12;
const MAX_EXTRA = 4000;
const HISTORY = 8;
const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const ORIGIN: Record<string, string> = { llm: "Analyse de la marque", fallback: "Brouillon sans analyse IA", expert: "Changement de l’expert", restore: "Restauration" };

const NOTICES = {
  couleur: ["success", "Couleur d’atelier mise à jour."],
  regle: ["success", "Règle retirée. Elle ne s’appliquera plus aux prochaines créations."],
  analyse: ["success", "Analyse relancée : une nouvelle version de la planche est en place. Vos règles sont conservées."],
  "analyse-echec": ["danger", "L’analyse n’a pas abouti : la planche actuelle est conservée. Réessayez dans un instant."],
  restaure: ["success", "Version restaurée, sous la forme d’une nouvelle version : rien n’a été effacé."],
  lien: ["success", "Lien public créé. Toute personne qui l’a peut voir la planche, sans compte."],
  "lien-coupe": ["success", "Lien public coupé : il ne fonctionne plus."],
  "lien-migration": ["warning", "Le lien public attend une mise à jour de la base : exécutez supabase/migrations/0006_brand_shares.sql dans Supabase → SQL Editor."],
} as const;

/**
 * Every action acts on the workspace's active brand: no brand id travels through a form.
 * Module scope on purpose: inline server actions serialise what they close over, and a function is not serialisable.
 */
async function active() {
  const { brand, userId } = await getWorkspace();
  if (!brand) redirect("/app/clients");
  return { brandId: brand.id, orgId: brand.org_id, userId };
}

export default async function MarquePage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { brand, os, mega, brandColor } = await getWorkspace();
  const { ok } = await searchParams;

  if (!brand) redirect("/app/clients");

  const supabase = await createSupabaseServerClient();
  const [board, share, { data: osVersions }, { data: megaVersions }] = await Promise.all([
    loadBoard(supabase, brand.id),
    getBrandShare(brand.id),
    supabase.from("brand_os_versions").select("version,created_at,canon").eq("brand_id", brand.id).order("version", { ascending: false }).limit(HISTORY),
    supabase.from("mega_prompts").select("version,created_at,content").eq("brand_id", brand.id).order("version", { ascending: false }).limit(HISTORY),
  ]);

  async function saveColor(formData: FormData) {
    "use server";
    await setBrandColor({ ...(await active()), hex: String(formData.get("hex") || "") });
    revalidatePath("/app", "layout"); // the colour lives on the app layout
    redirect("/app/marque?ok=couleur");
  }

  async function dropRule(formData: FormData) {
    "use server";
    await removeRule({ ...(await active()), rule: String(formData.get("rule") || "") });
    redirect("/app/marque?ok=regle");
  }

  async function rebuild(formData: FormData) {
    "use server";
    const outcome = await rebuildBrandOS({ ...(await active()), extra: String(formData.get("extra") || "").slice(0, MAX_EXTRA) });
    revalidatePath("/app", "layout"); // a new analysis may change the palette
    redirect(outcome === "llm" ? "/app/marque?ok=analyse" : "/app/marque?ok=analyse-echec");
  }

  async function restore(formData: FormData) {
    "use server";
    const version = Number(formData.get("version"));
    if (!Number.isInteger(version) || version < 1) redirect("/app/marque");
    const args = { ...(await active()), version };
    if (formData.get("kind") === "rules") await restoreMegaVersion(args);
    else await restoreBrandOSVersion(args);
    revalidatePath("/app", "layout");
    redirect("/app/marque?ok=restaure");
  }

  async function shareBoard() {
    "use server";
    const outcome = await createBrandShare(await active());
    redirect(outcome === "ok" ? "/app/marque?ok=lien" : "/app/marque?ok=lien-migration");
  }

  async function unshareBoard() {
    "use server";
    await revokeBrandShares((await active()).brandId);
    redirect("/app/marque?ok=lien-coupe");
  }

  const notice = ok && ok in NOTICES ? NOTICES[ok as keyof typeof NOTICES] : null;
  const rules = mega?.rules ?? [];
  const llmReady = isLlmConfigured();
  const isDraft = (osVersions?.[0]?.canon as { generated_by?: string } | null)?.generated_by === "fallback";

  if (!board) {
    return (
      <Empty title={`${brand.name} n’a pas encore de planche`} action={<ButtonLink href="/onboarding/01">Reprendre l’analyse</ButtonLink>}>
        La planche de marque se construit à partir du site ou de la description du client : positionnement, voix, palette, direction visuelle.
      </Empty>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <Meta>
          Marque · la planche de {brand.name}
          {os ? ` · v${os.version}` : ""}
        </Meta>
        <div className="flex flex-wrap items-center gap-2">
          <PrintButton />
          {share ? (
            <>
              <CopyLink path={`/p/${share.token}`} />
              <ButtonLink href={`/p/${share.token}`} target="_blank" variant="soft">
                <ExternalLink size={16} strokeWidth={1.75} /> Voir
              </ButtonLink>
              <form action={unshareBoard}>
                <SubmitButton variant="ghost" pendingLabel="…">
                  <Link2Off size={16} strokeWidth={1.75} /> Couper le lien
                </SubmitButton>
              </form>
            </>
          ) : (
            <form action={shareBoard}>
              <SubmitButton variant="soft" pendingLabel="Création…">
                <Link2 size={16} strokeWidth={1.75} /> Créer un lien public
              </SubmitButton>
            </form>
          )}
        </div>
      </div>

      <div className="grid gap-4 print:hidden">
        {notice ? <Notice tone={notice[0]}>{notice[1]}</Notice> : null}
        {isDraft ? (
          <Notice tone="warning">
            Cette planche est un brouillon produit sans analyse IA. {llmReady ? "Relancez l’analyse dans les coulisses, en bas de page." : "Configurez OPENROUTER_API_KEY sur le serveur, puis relancez l’analyse."}
          </Notice>
        ) : null}
      </div>

      <BrandBoard board={board} editable />

      {/* ---- Les coulisses : la mécanique, à l'écart de ce qu'on montre ---- */}
      <details className="group rounded-card bg-shell print:hidden" open={Boolean(notice)}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-card bg-card p-6">
          <span>
            <span className="block text-title text-ink">Coulisses</span>
            <span className="text-small text-mute">Règles apprises, couleur d’atelier, relancer l’analyse, versions.</span>
          </span>
          <Meta>
            {rules.length} règle{rules.length > 1 ? "s" : ""} · {osVersions?.length ?? 0} version{(osVersions?.length ?? 0) > 1 ? "s" : ""}
          </Meta>
        </summary>

        <div className="mt-4 grid gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-7">
            <CardHeader
              title="Ce que l’atelier a appris"
              aside={
                <span className="flex items-center gap-2">
                  {mega ? <VersionTag v={mega.version} /> : null}
                  <Meta>{rules.length} / {MAX_RULES}</Meta>
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
              <p className="text-small text-mute">Aucune règle. Elles naissent de vos échanges avec l’expert et s’appliquent à toutes les créations suivantes.</p>
            )}
          </Card>

          <Card className="lg:col-span-5">
            <CardHeader title="Couleur d’atelier" aside={<Meta>{brandColor}</Meta>} />
            <p className="text-small text-mute">Celle qui teinte l’outil quand ce client est actif. Elle passe en tête de palette.</p>
            <form action={saveColor} className="mt-4 flex items-center gap-4">
              <input type="color" name="hex" defaultValue={brandColor} aria-label="Couleur d’atelier" className="size-12 cursor-pointer rounded-inner border-0 bg-transparent p-0" />
              <SubmitButton variant="soft" pendingLabel="…">Appliquer</SubmitButton>
            </form>
          </Card>

          <Card className="lg:col-span-7">
            <CardHeader title="Relancer l’analyse" />
            <form action={rebuild} className="grid gap-4">
              <Field label="Matière supplémentaire" hint="Facultatif : manifeste, brief client, nouveau texte de présentation… Le site est relu (logo compris), la planche actuelle est respectée, vos règles sont conservées.">
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
            <CardHeader title="Versions" aside={<Meta>restaurer ne supprime rien</Meta>} />
            <ol>
              {(osVersions ?? []).map((version, index) => {
                const canon = version.canon as { change?: string; generated_by?: string } | null;
                return (
                  <li key={`os-${version.version}`} className="grid gap-1 border-t border-line py-3 first:border-t-0 first:pt-0">
                    <span className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2"><VersionTag v={version.version} /><span className="text-small text-ink">Planche</span></span>
                      <Meta className="whitespace-nowrap">{DATE.format(new Date(version.created_at))}</Meta>
                    </span>
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-small text-mute">{canon?.change ?? ORIGIN[canon?.generated_by ?? ""] ?? "Modifiée à la main"}</span>
                      {index > 0 ? (
                        <form action={restore}>
                          <input type="hidden" name="version" value={version.version} />
                          <SubmitButton variant="ghost" pendingLabel="…" className="py-0"><History size={14} strokeWidth={1.75} /> Restaurer</SubmitButton>
                        </form>
                      ) : <Meta>actuelle</Meta>}
                    </span>
                  </li>
                );
              })}
              {(megaVersions ?? []).map((version, index) => {
                const log = (version.content as { changelog?: { note: string }[] } | null)?.changelog;
                return (
                  <li key={`mega-${version.version}`} className="grid gap-1 border-t border-line py-3">
                    <span className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2"><VersionTag v={version.version} /><span className="text-small text-ink">Règles</span></span>
                      <Meta className="whitespace-nowrap">{DATE.format(new Date(version.created_at))}</Meta>
                    </span>
                    <span className="flex items-center justify-between gap-3">
                      <span className="line-clamp-2 text-small text-mute">{log?.at(-1)?.note ?? "Consignes créatives initiales"}</span>
                      {index > 0 ? (
                        <form action={restore}>
                          <input type="hidden" name="version" value={version.version} />
                          <input type="hidden" name="kind" value="rules" />
                          <SubmitButton variant="ghost" pendingLabel="…" className="py-0"><History size={14} strokeWidth={1.75} /> Restaurer</SubmitButton>
                        </form>
                      ) : <Meta>actuelles</Meta>}
                    </span>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>
      </details>
    </>
  );
}
