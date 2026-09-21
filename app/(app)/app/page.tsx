import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ArrowUpRight, CalendarDays, Check, Clock, MessageSquareWarning, ScanSearch, Target } from "lucide-react";
import { OutTile, type OutRow } from "@/components/app/OutTile";
import { BrandCard, ButtonLink, Card, CardHeader, Empty, Field, Input, Meta, Tag, Textarea, VersionTag } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FORMAT_FAMILIES, IMAGE_FORMATS, OFFERED_FORMATS, type FormatFamily } from "@/lib/brand-os";
import { PROPOSALS_PER_BRIEF } from "@/lib/jobs/engine";
import { CHANNELS, toDay, upcomingEntries } from "@/lib/calendar";
import { listClientCards } from "@/lib/clients";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";
import { createProposals } from "./studio/actions";

export const dynamic = "force-dynamic";

const RECENT_OUTS = 4;
const UPCOMING = 3;
const RECENT_CHANGES = 4;
const TODAY = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const WHEN = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
// Calendar days are dates, not instants: format in UTC so no time zone shifts them.
const DAY_NUMBER = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", timeZone: "UTC" });
const DAY_MONTH = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });

const ORIGIN_LABEL: Record<string, string> = { llm: "Analyse de la marque", fallback: "Brouillon sans analyse IA", expert: "Changement de l’expert" };

export default async function ClientHome() {
  const { brand, brands, os, mega } = await getWorkspace();
  if (!brand) redirect("/app/clients");

  const today = toDay(new Date());
  const supabase = await createSupabaseServerClient();
  const [{ data: outs }, upcoming, { active }, { data: versions }] = await Promise.all([
    supabase.from("outs").select("id,kind,status,created_at,payload").eq("brand_id", brand.id).neq("status", "archived").order("created_at", { ascending: false }).limit(RECENT_OUTS),
    upcomingEntries(brand.id, today, UPCOMING),
    listClientCards(today),
    supabase.from("brand_os_versions").select("version,created_at,canon").eq("brand_id", brand.id).order("version", { ascending: false }).limit(RECENT_CHANGES),
  ]);
  const signals = active.find((client) => client.id === brand.id);

  // What is waiting for a decision, most blocking first. Each line leads to where it is settled.
  const todo = [
    signals?.brandOS === "none" && { icon: ScanSearch, text: "Le Brand OS n’est pas encore construit.", href: "/app/marque", cta: "Ouvrir la marque" },
    signals?.brandOS === "draft" && { icon: ScanSearch, text: "Le Brand OS est un brouillon, produit sans analyse IA.", href: "/app/marque", cta: "Relancer l’analyse" },
    signals?.pendingProposals && {
      icon: MessageSquareWarning,
      text: `${signals.pendingProposals} proposition${signals.pendingProposals > 1 ? "s" : ""} de l’expert attend${signals.pendingProposals > 1 ? "ent" : ""} votre décision.`,
      href: "/app/expert",
      cta: "Décider",
    },
    signals?.drafts && {
      icon: Clock,
      text: `${signals.drafts} brouillon${signals.drafts > 1 ? "s" : ""} à trier : garder ou archiver.`,
      href: "/app/studio?vue=brouillons",
      cta: "Trier",
    },
    signals && signals.kept > 0 && !signals.nextPublication && { icon: CalendarDays, text: "Des créations sont gardées, mais rien n’est planifié.", href: "/app/calendrier", cta: "Planifier" },
    signals?.brandOS === "ready" && !signals.hasStrategy && {
      icon: Target,
      text: "Aucune stratégie posée : objectifs, canaux, angles, rythme.",
      href: `/app/expert?message=${encodeURIComponent("Posons la stratégie de cette marque : objectifs, canaux, angles, rythme.")}`,
      cta: "En parler à l’expert",
    },
  ].filter((item): item is { icon: typeof Clock; text: string; href: string; cta: string } => Boolean(item));

  const changes = [
    ...(versions ?? []).map((v) => {
      const canon = v.canon as { change?: string; generated_by?: string } | null;
      return { at: v.created_at as string, tag: `Brand OS v${v.version}`, text: canon?.change ?? ORIGIN_LABEL[canon?.generated_by ?? ""] ?? "Résumé modifié à la main" };
    }),
    ...(mega?.changelog ?? []).map((entry) => ({ at: entry.at, tag: `Règles v${entry.v}`, text: entry.note })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, RECENT_CHANGES);

  return (
    <>
      <header>
        <Meta className="block first-letter:uppercase">
          {TODAY.format(new Date())}
          {brands.length > 1 ? ` · ${brands.length} clients dans l’atelier` : ""}
        </Meta>
        <h1 className="mt-2 font-display text-display text-ink">
          <em className="highlighter">{brand.name}</em>
        </h1>
      </header>

      <div className="grid gap-4 lg:grid-cols-12">
        <BrandCard className="lg:col-span-5">
          <div className="grid h-full content-between gap-6">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-meta opacity-80">{os ? `Brand OS · v${os.version}` : "Brand OS · à construire"}</span>
              <ButtonLink href="/app/marque" variant="ghost" className="text-on-brand opacity-80 hover:text-on-brand hover:opacity-100">
                Ouvrir <ArrowUpRight size={18} strokeWidth={1.75} />
              </ButtonLink>
            </div>
            <p className="font-display text-h2 font-normal">{os?.canon?.promise || os?.summary.split("\n")[0] || "Cette marque n’a pas encore de Brand OS."}</p>
            {os?.canon?.tone.length ? (
              <ul className="flex flex-wrap gap-2">
                {os.canon.tone.map((tone) => (
                  <li key={tone} className="rounded-pill bg-on-brand/15 px-3 py-1 text-small">{tone}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </BrandCard>

        <Card className="lg:col-span-7">
          <CardHeader title="Ce qui vous attend" aside={<Meta>{todo.length ? `${todo.length} point${todo.length > 1 ? "s" : ""}` : "à jour"}</Meta>} />
          {todo.length ? (
            <ul>
              {todo.map(({ icon: Icon, text, href, cta }) => (
                <li key={text} className="flex items-center justify-between gap-4 border-t border-line py-3 first:border-t-0 first:pt-0">
                  <span className="flex min-w-0 items-center gap-3 text-body text-ink">
                    <span className="grid size-8 flex-none place-items-center rounded-pill bg-tint text-ink"><Icon size={16} strokeWidth={1.75} /></span>
                    {text}
                  </span>
                  <ButtonLink href={href} variant="soft" className="flex-none">
                    {cta} <ArrowRight size={16} strokeWidth={1.75} />
                  </ButtonLink>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-3 text-body text-mute">
              <span className="grid size-8 flex-none place-items-center rounded-pill bg-success-tint text-success"><Check size={16} strokeWidth={1.75} /></span>
              Rien en attente pour ce client.
            </p>
          )}
        </Card>

        <Card className="lg:col-span-6">
          <CardHeader title="Créer un visuel" aside={<Meta>brief → image</Meta>} />
          <form action={createProposals} className="grid gap-4">
            <Field label="Brief" hint="Facultatif. Sans brief, Brand OS illustre la promesse de la marque.">
              <Textarea name="brief" rows={2} maxLength={800} placeholder="Une scène, un objet, une situation…" />
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* The full picker (and custom formats) lives in the Studio; here a compact grouped list is enough. */}
              <select name="format" defaultValue="social_square" aria-label="Format" className="max-w-full rounded-pill bg-soft px-4 py-2 text-small text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                {(Object.keys(FORMAT_FAMILIES) as FormatFamily[]).map((family) => (
                  <optgroup key={family} label={FORMAT_FAMILIES[family]}>
                    {OFFERED_FORMATS.filter((key) => IMAGE_FORMATS[key].family === family).map((key) => (
                      <option key={key} value={key}>
                        {IMAGE_FORMATS[key].label} · {IMAGE_FORMATS[key].aspectRatio}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <SubmitButton pendingLabel="Création… (≈ 30 s)">Créer {PROPOSALS_PER_BRIEF} propositions</SubmitButton>
            </div>
          </form>
        </Card>

        <Card className="lg:col-span-6">
          <CardHeader title="Dire à l’expert ce qui ne va pas" aside={<Meta>il ajuste la marque</Meta>} />
          {/* A plain GET form: the Expert screen picks the message up and sends it. */}
          <form action="/app/expert" method="get" className="grid gap-4">
            <Field label="Votre retour" hint="Il regarde les dernières créations, puis propose un changement du Brand OS ou des règles. Vous validez.">
              <Input name="message" required maxLength={500} placeholder="« Les visuels sont trop froids », « le ton est trop sage »…" />
            </Field>
            <SubmitButton variant="soft" pendingLabel="Ouverture…" className="justify-self-end">
              Envoyer à l’expert <ArrowRight size={16} strokeWidth={1.75} />
            </SubmitButton>
          </form>
        </Card>

        <Card className="lg:col-span-12">
          <CardHeader
            title="Dernières créations"
            aside={
              <ButtonLink href="/app/studio" variant="ghost">
                Tout le Studio <ArrowUpRight size={18} strokeWidth={1.75} />
              </ButtonLink>
            }
          />
          {outs?.length ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {(outs as OutRow[]).map((out) => (
                <OutTile key={out.id} out={out} />
              ))}
            </div>
          ) : (
            <Empty title="Rien d’épinglé pour l’instant">Les visuels créés pour {brand.name} apparaîtront ici, du plus récent au plus ancien.</Empty>
          )}
        </Card>

        <Card className="lg:col-span-6">
          <CardHeader
            title="Prochaines publications"
            aside={
              <ButtonLink href="/app/calendrier" variant="ghost">
                Calendrier <ArrowUpRight size={18} strokeWidth={1.75} />
              </ButtonLink>
            }
          />
          {upcoming.length ? (
            <ul>
              {upcoming.map((entry) => {
                const date = new Date(`${entry.scheduled_on}T00:00:00Z`);
                return (
                  <li key={entry.id} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-4 border-t border-line py-3 first:border-t-0 first:pt-0">
                    <span className="grid justify-items-center rounded-inner bg-tint py-2 transition-colors duration-(--duration-retint) ease-cimaise">
                      <Meta className="uppercase">{DAY_MONTH.format(date)}</Meta>
                      <span className="font-display text-h2 font-normal leading-none text-ink">{DAY_NUMBER.format(date)}</span>
                    </span>
                    <span className="truncate text-small text-ink">{entry.caption || entry.out?.payload?.brief || "Idée de publication"}</span>
                    <Tag>{CHANNELS[entry.channel]}</Tag>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-small text-mute">Rien de planifié. Les créations gardées se planifient dans le Calendrier.</p>
          )}
        </Card>

        <Card className="lg:col-span-6">
          <CardHeader
            title="Ce qui a changé dans la marque"
            aside={
              <Link href="/app/marque" className="flex items-center gap-2">
                {mega ? <VersionTag v={mega.version} /> : null}
                <Meta>{mega?.rules.length ?? 0} règle{(mega?.rules.length ?? 0) > 1 ? "s" : ""}</Meta>
              </Link>
            }
          />
          {changes.length ? (
            <ul>
              {changes.map((change) => (
                <li key={`${change.tag}-${change.at}`} className="grid gap-1 border-t border-line py-3 first:border-t-0 first:pt-0">
                  <span className="flex items-center justify-between gap-3">
                    <Tag>{change.tag}</Tag>
                    <Meta className="whitespace-nowrap">{WHEN.format(new Date(change.at))}</Meta>
                  </span>
                  <span className="text-small text-ink">{change.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-small text-mute">Aucun changement pour l’instant. Ils naissent de vos échanges avec l’expert.</p>
          )}
        </Card>
      </div>
    </>
  );
}
