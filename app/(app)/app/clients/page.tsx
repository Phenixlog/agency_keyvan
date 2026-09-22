import type { CSSProperties } from "react";
import { Archive, ArchiveRestore, ArrowUpRight, CalendarDays, Clock, Coins, ImageOff, MessageSquareReply, MessageSquareWarning, Pencil, Plus, ScanSearch } from "lucide-react";
import { ButtonLink, Card, Empty, Input, Meta, Notice, Tag } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { toDay } from "@/lib/calendar";
import { listClientCards, weekAcrossClients } from "@/lib/clients";
import { CHANNELS } from "@/lib/calendar/model";
import { brandStyle } from "@/lib/tokens";
import { getWorkspace } from "@/lib/workspace";
import { archiveClient, openClient, renameClient, restoreClient } from "./actions";

export const dynamic = "force-dynamic";

// Calendar days are dates, not instants: format in UTC so no time zone shifts them.
const DAY = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

const NOTICES = {
  archive: ["success", "Client archivé. Rien n’est supprimé : vous pouvez le restaurer en bas de page."],
  migration: ["warning", "L’archivage attend une mise à jour de la base : exécutez supabase/migrations/0005_expert_and_clients.sql dans Supabase → SQL Editor."],
} as const;

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ etat?: string }> }) {
  const { brand: activeBrand } = await getWorkspace();
  const { etat } = await searchParams;
  const today = toDay(new Date());
  const [{ active, archived }, week] = await Promise.all([listClientCards(today), weekAcrossClients(today)]);
  const notice = etat && etat in NOTICES ? NOTICES[etat as keyof typeof NOTICES] : null;
  const byDay = new Map<string, typeof week>();
  for (const item of week) byDay.set(item.day, [...(byDay.get(item.day) ?? []), item]);
  const unready = week.filter((w) => !w.ready).length;
  const changes = week.filter((w) => w.clientStatus === "changes").length;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Meta>
            {active.length} client{active.length > 1 ? "s" : ""} dans l’atelier
          </Meta>
          <h1 className="mt-2 font-display text-display text-ink">Mes clients</h1>
        </div>
        <ButtonLink href="/onboarding/01">
          <Plus size={18} strokeWidth={1.75} /> Ajouter un client
        </ButtonLink>
      </header>

      {notice ? <Notice tone={notice[0]}>{notice[1]}</Notice> : null}

      {/* ---- Ma semaine, tous clients : ce qui part dans les 7 jours, et ce qui manque encore ---- */}
      {active.length > 0 ? (
        <Card className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <Meta>Les 7 prochains jours · {week.length} publication{week.length > 1 ? "s" : ""}</Meta>
              <h2 className="mt-1 font-display text-h2 font-normal text-ink">Ma semaine, tous clients</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {unready ? <Tag tone="warning"><ImageOff size={12} strokeWidth={1.75} /> {unready} à compléter</Tag> : week.length ? <Tag tone="success">Tout est prêt</Tag> : null}
              {changes ? <Tag tone="danger"><MessageSquareReply size={12} strokeWidth={1.75} /> {changes} changement{changes > 1 ? "s" : ""} demandé{changes > 1 ? "s" : ""} par un client</Tag> : null}
            </div>
          </div>
          {week.length ? (
            <ol className="grid gap-1">
              {[...byDay.entries()].map(([day, items]) => (
                <li key={day} className="grid gap-1 border-t border-line py-2 first:border-t-0 md:grid-cols-[9rem_minmax(0,1fr)]">
                  <Meta className="pt-2">{day === today ? "Aujourd’hui" : DAY.format(new Date(`${day}T00:00:00Z`))}</Meta>
                  <ul className="grid gap-1">
                    {items.map((item) => (
                      <li key={item.entryId} style={brandStyle(item.color) as CSSProperties}>
                        <form action={openClient}>
                          <input type="hidden" name="brandId" value={item.brandId} />
                          <input type="hidden" name="next" value={`/app/calendrier?mois=${item.day.slice(0, 7)}&jour=${item.day}#${item.entryId}`} />
                          <button type="submit" className="flex w-full flex-wrap items-center gap-3 rounded-inner px-3 py-2 text-left transition duration-(--duration-fast) ease-cimaise hover:bg-soft">
                            <span className="size-3 flex-none rounded-pill bg-brand" aria-hidden />
                            <span className="min-w-0 flex-1 truncate text-small text-ink">
                              <span className="font-semibold">{item.brandName}</span>
                              <span className="text-mute"> · {CHANNELS[item.channel as keyof typeof CHANNELS] ?? item.channel}</span>
                              {item.headline ? <span className="text-mute"> · « {item.headline} »</span> : null}
                            </span>
                            {item.clientStatus === "changes" ? <Tag tone="danger">Changement demandé</Tag> : item.clientStatus === "approved" ? <Tag tone="success">Validée par le client</Tag> : null}
                            {item.ready ? <Tag tone="success">Prête</Tag> : <Tag tone="warning">Il manque {item.missing.join(" et ")}</Tag>}
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-small text-mute">Rien de planifié dans les 7 jours. Ouvrez un client, puis « Proposer le mois » dans son calendrier.</p>
          )}
        </Card>
      ) : null}

      {active.length === 0 ? (
        <Empty title="Aucun client pour l’instant" action={<ButtonLink href="/onboarding/01">Analyser une première marque</ButtonLink>}>
          Donnez l’adresse du site d’un client ou décrivez-le : Brand OS en tire son identité, puis crée des visuels qui la respectent.
        </Empty>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {active.map((client) => (
            // Each card carries its own client colour: the list shows every brand at once.
            <li key={client.id} style={brandStyle(client.color) as CSSProperties}>
              <Card className={`grid h-full grid-cols-[minmax(0,1fr)] content-start gap-4 p-4 ${client.id === activeBrand?.id ? "outline-2 outline-offset-2 outline-ink" : ""}`}>
                <form action={openClient}>
                  <input type="hidden" name="brandId" value={client.id} />
                  <button type="submit" className="group grid w-full gap-4 text-left" aria-label={`Ouvrir ${client.name}`}>
                    <span className="relative block aspect-video overflow-hidden rounded-inner bg-brand">
                      {client.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={client.cover} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition duration-(--duration-base) ease-cimaise group-hover:scale-105" />
                      ) : (
                        <span aria-hidden className="hatch absolute inset-0 text-on-brand opacity-20" />
                      )}
                      <span className="absolute bottom-2 left-2 size-6 rounded-pill border-2 border-card bg-brand" aria-hidden />
                    </span>
                    <span className="grid gap-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-display text-h2 font-normal text-ink">{client.name}</span>
                        <ArrowUpRight size={18} strokeWidth={1.75} className="flex-none text-mute transition duration-(--duration-fast) ease-cimaise group-hover:text-ink" />
                      </span>
                      <span className="line-clamp-2 text-small text-mute">{client.promise || "Identité à construire."}</span>
                    </span>
                  </button>
                </form>

                <ul className="flex flex-wrap gap-2">
                  {client.brandOS === "none" ? (
                    <li><Tag tone="warning"><ScanSearch size={12} strokeWidth={1.75} /> Brand OS à construire</Tag></li>
                  ) : client.brandOS === "draft" ? (
                    <li><Tag tone="warning"><ScanSearch size={12} strokeWidth={1.75} /> Brand OS en brouillon</Tag></li>
                  ) : (
                    <li><Tag>Brand OS v{client.brandOSVersion}</Tag></li>
                  )}
                  {client.pendingProposals ? (
                    <li><Tag tone="warning"><MessageSquareWarning size={12} strokeWidth={1.75} /> {client.pendingProposals} proposition{client.pendingProposals > 1 ? "s" : ""} de l’expert</Tag></li>
                  ) : null}
                  {client.drafts ? (
                    <li><Tag tone="warning"><Clock size={12} strokeWidth={1.75} /> {client.drafts} brouillon{client.drafts > 1 ? "s" : ""} à trier</Tag></li>
                  ) : null}
                  {client.weekUnready ? (
                    <li><Tag tone="warning"><ImageOff size={12} strokeWidth={1.75} /> {client.weekUnready} publication{client.weekUnready > 1 ? "s" : ""} à compléter cette semaine</Tag></li>
                  ) : null}
                  {client.clientChanges ? (
                    <li><Tag tone="danger"><MessageSquareReply size={12} strokeWidth={1.75} /> Le client demande {client.clientChanges} changement{client.clientChanges > 1 ? "s" : ""}</Tag></li>
                  ) : null}
                  <li>
                    <Tag tone={client.nextPublication ? "success" : "neutral"}>
                      <CalendarDays size={12} strokeWidth={1.75} />
                      {client.nextPublication ? `Prochaine : ${DAY.format(new Date(`${client.nextPublication}T00:00:00Z`))}` : "Rien de planifié"}
                    </Tag>
                  </li>
                </ul>

                <Meta className="flex items-center gap-2">
                  <Coins size={12} strokeWidth={1.75} /> Ce mois-ci : {client.cost.images} image{client.cost.images > 1 ? "s" : ""}{client.cost.images ? ` · environ ${client.cost.euros.toFixed(2).replace(".", ",")} € d’images, hors 4K et texte` : ""}
                </Meta>

                <details className="group/manage border-t border-line pt-3">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-small text-mute transition duration-(--duration-fast) ease-cimaise hover:text-ink">
                    <Pencil size={14} strokeWidth={1.75} /> Renommer ou archiver
                  </summary>
                  <div className="mt-3 grid gap-3">
                    <form action={renameClient} className="flex gap-2">
                      <input type="hidden" name="brandId" value={client.id} />
                      <Input name="name" required maxLength={80} defaultValue={client.name} aria-label="Nom du client" className="py-2" />
                      <SubmitButton variant="soft" pendingLabel="…">Renommer</SubmitButton>
                    </form>
                    <form action={archiveClient}>
                      <input type="hidden" name="brandId" value={client.id} />
                      <SubmitButton variant="ghost" pendingLabel="…">
                        <Archive size={16} strokeWidth={1.75} /> Archiver ce client (rien n’est supprimé)
                      </SubmitButton>
                    </form>
                  </div>
                </details>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {archived.length ? (
        <details className="rounded-card bg-card p-6">
          <summary className="cursor-pointer list-none text-title text-ink">
            Clients archivés <Meta className="ml-2">{archived.length}</Meta>
          </summary>
          <ul className="mt-4">
            {archived.map((client) => (
              <li key={client.id} className="flex items-center justify-between gap-4 border-t border-line py-3 first:border-t-0">
                <span className="text-body text-ink">{client.name}</span>
                <form action={restoreClient}>
                  <input type="hidden" name="brandId" value={client.id} />
                  <SubmitButton variant="soft" pendingLabel="…">
                    <ArchiveRestore size={16} strokeWidth={1.75} /> Restaurer
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
