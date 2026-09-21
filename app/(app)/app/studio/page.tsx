import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, ArchiveRestore, Clock, ExternalLink, Pin, RefreshCw } from "lucide-react";
import { BrandCard, ButtonLink, Card, Empty, Input, Meta, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { formatLabel } from "@/components/app/OutTile";
import { IMAGE_FORMATS, type ImageFormat } from "@/lib/brand-os";
import { queueImageGeneration } from "@/lib/jobs/engine";
import { bumpMegaPrompt } from "@/lib/learning";
import { outImageUrl, setOutStatus, type OutPayload, type OutStatus } from "@/lib/outs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const MAX_FEEDBACK = 300;
const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

const VIEWS = {
  actives: { label: "En cours", statuses: ["draft", "ready"] },
  gardees: { label: "Gardées", statuses: ["ready"] },
  brouillons: { label: "Brouillons", statuses: ["draft"] },
  archives: { label: "Archives", statuses: ["archived"] },
} as const satisfies Record<string, { label: string; statuses: readonly OutStatus[] }>;
type View = keyof typeof VIEWS;

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; focus?: string; appris?: string }>;
}) {
  const { brand, mega } = await getWorkspace();
  const { vue, focus, appris } = await searchParams;
  const view: View = vue && vue in VIEWS ? (vue as View) : "actives";

  if (!brand) {
    return (
      <Empty title="Le Studio est vide" action={<ButtonLink href="/onboarding">Analyser une marque</ButtonLink>}>
        Les créations d’une marque s’affichent ici une fois son Brand OS en place.
      </Empty>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: outs } = await supabase
    .from("outs")
    .select("id,status,created_at,payload")
    .eq("brand_id", brand.id)
    .in("status", [...VIEWS[view].statuses])
    .order("created_at", { ascending: false });

  const back = `/app/studio?vue=${view}`;

  async function setStatus(formData: FormData) {
    "use server";
    await getWorkspace();
    const status = String(formData.get("status")) as OutStatus;
    if (!["draft", "ready", "archived"].includes(status)) return;
    await setOutStatus(String(formData.get("outId")), status);
    // `back` comes from a hidden field: only ever return to the Studio, never to an arbitrary URL.
    const requestedBack = String(formData.get("back") || "");
    redirect(requestedBack.startsWith("/app/studio?vue=") ? requestedBack : "/app/studio");
  }

  async function recreate(formData: FormData) {
    "use server";
    const { brand, userId } = await getWorkspace();
    if (!brand) redirect("/app");
    const requested = String(formData.get("format") || "");
    const format: ImageFormat = requested in IMAGE_FORMATS ? (requested as ImageFormat) : "social_square";
    // Same brief, same format: what changes is what the workshop has learned since.
    const brief = String(formData.get("brief") || "");
    const { jobId } = await queueImageGeneration({ orgId: brand.org_id, brandId: brand.id, userId, brief, format });
    redirect(`/app/creer?job=${jobId}`);
  }

  async function learn(formData: FormData) {
    "use server";
    const { brand, userId } = await getWorkspace();
    if (!brand) redirect("/app");
    const feedback = String(formData.get("feedback") || "").trim().slice(0, MAX_FEEDBACK);
    if (!feedback) return;
    await bumpMegaPrompt({ brandId: brand.id, userId, feedback });
    redirect("/app/studio?appris=1");
  }

  const rulesCount = mega?.rules.length ?? 0;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Meta>Studio · {brand.name}</Meta>
          <h1 className="mt-2 font-display text-display text-ink">Le mur</h1>
        </div>
        <nav aria-label="Filtrer les créations" className="flex gap-1 overflow-x-auto rounded-pill bg-card p-1">
          {(Object.keys(VIEWS) as View[]).map((key) => (
            <Link
              key={key}
              href={`/app/studio?vue=${key}`}
              aria-current={key === view ? "page" : undefined}
              className="whitespace-nowrap rounded-pill px-4 py-2 text-small text-mute transition duration-(--duration-fast) ease-cimaise hover:text-ink aria-[current=page]:bg-ink aria-[current=page]:text-card"
            >
              {VIEWS[key].label}
            </Link>
          ))}
        </nav>
      </header>

      {appris ? <Notice tone="success">Remarque intégrée : elle s’appliquera aux prochaines créations.</Notice> : null}

      <BrandCard>
        <form action={learn} className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          {/* Not <Field>: its label is ink, unreadable on a dark client colour. Here the label inherits on-brand. */}
          <label className="grid gap-2">
            <span className="font-display text-h2 font-normal">Quelque chose ne va pas dans ces visuels ?</span>
            <Input
              name="feedback"
              required
              maxLength={MAX_FEEDBACK}
              placeholder="« moins de bleu », « toujours une personne dans le cadre », « pas de texte »…"
              className="bg-card"
            />
          </label>
          <SubmitButton variant="soft" pendingLabel="Intégration…">En faire une règle</SubmitButton>
        </form>
        <p className="mt-4 font-mono text-meta opacity-80">
          {rulesCount} règle{rulesCount > 1 ? "s" : ""} apprise{rulesCount > 1 ? "s" : ""} · appliquée{rulesCount > 1 ? "s" : ""} à toutes
          les créations suivantes
        </p>
      </BrandCard>

      {outs?.length ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {outs.map((out) => {
            const payload = out.payload as OutPayload | null;
            const src = outImageUrl(payload);
            const status = out.status as OutStatus;
            return (
              <li key={out.id} id={out.id}>
                <Card className={`grid gap-4 p-4 ${focus === out.id ? "outline-2 outline-offset-2 outline-ink" : ""}`}>
                  <div className="relative aspect-square overflow-hidden rounded-inner bg-tint">
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt={payload?.brief || "Création"} loading="lazy" className="size-full object-cover" />
                    ) : null}
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-pill bg-card px-2 py-1 font-mono text-meta text-ink">
                      {status === "ready" ? <Pin size={12} strokeWidth={1.75} /> : status === "archived" ? <Archive size={12} strokeWidth={1.75} /> : <Clock size={12} strokeWidth={1.75} />}
                      {status === "ready" ? "Gardée" : status === "archived" ? "Archivée" : "Brouillon"}
                    </span>
                    {src ? (
                      <a
                        href={src}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Ouvrir l’image en grand"
                        className="absolute right-2 top-2 grid size-8 place-items-center rounded-pill bg-card text-ink transition duration-(--duration-fast) ease-cimaise hover:bg-ink hover:text-card"
                      >
                        <ExternalLink size={14} strokeWidth={1.75} />
                      </a>
                    ) : null}
                  </div>
                  <div className="grid gap-1">
                    <p className="line-clamp-2 text-small text-ink">{payload?.brief || "Sans brief"}</p>
                    <Meta>
                      {formatLabel(payload)} · {DATE.format(new Date(out.created_at))}
                    </Meta>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {status === "draft" ? (
                      <form action={setStatus}>
                        <input type="hidden" name="outId" value={out.id} />
                        <input type="hidden" name="status" value="ready" />
                        <input type="hidden" name="back" value={back} />
                        <SubmitButton variant="soft" pendingLabel="…">
                          <Pin size={16} strokeWidth={1.75} /> Garder
                        </SubmitButton>
                      </form>
                    ) : null}
                    <form action={recreate}>
                      <input type="hidden" name="brief" value={payload?.brief ?? ""} />
                      <input type="hidden" name="format" value={payload?.format ?? "social_square"} />
                      <SubmitButton variant="soft" pendingLabel="Création… (≈ 20 s)">
                        <RefreshCw size={16} strokeWidth={1.75} /> Recréer
                      </SubmitButton>
                    </form>
                    <form action={setStatus}>
                      <input type="hidden" name="outId" value={out.id} />
                      <input type="hidden" name="status" value={status === "archived" ? "draft" : "archived"} />
                      <input type="hidden" name="back" value={back} />
                      <SubmitButton variant="ghost" pendingLabel="…">
                        {status === "archived" ? <ArchiveRestore size={16} strokeWidth={1.75} /> : <Archive size={16} strokeWidth={1.75} />}
                        {status === "archived" ? "Restaurer" : "Archiver"}
                      </SubmitButton>
                    </form>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty
          title={view === "actives" ? "Rien d’épinglé pour l’instant" : `Aucune création dans « ${VIEWS[view].label} »`}
          action={view === "actives" ? <ButtonLink href="/app/creer">Créer un visuel</ButtonLink> : undefined}
        >
          {view === "actives"
            ? `Les visuels créés pour ${brand.name} apparaîtront ici.`
            : "Changez de filtre pour voir les autres créations."}
        </Empty>
      )}
    </>
  );
}
