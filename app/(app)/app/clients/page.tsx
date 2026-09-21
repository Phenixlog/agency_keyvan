import type { CSSProperties } from "react";
import { Archive, ArchiveRestore, ArrowUpRight, CalendarDays, Clock, MessageSquareWarning, Pencil, Plus, ScanSearch } from "lucide-react";
import { ButtonLink, Card, Empty, Input, Meta, Notice, Tag } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { toDay } from "@/lib/calendar";
import { listClientCards } from "@/lib/clients";
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
  const { active, archived } = await listClientCards(toDay(new Date()));
  const notice = etat && etat in NOTICES ? NOTICES[etat as keyof typeof NOTICES] : null;

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
                  <li>
                    <Tag tone={client.nextPublication ? "success" : "neutral"}>
                      <CalendarDays size={12} strokeWidth={1.75} />
                      {client.nextPublication ? `Prochaine : ${DAY.format(new Date(`${client.nextPublication}T00:00:00Z`))}` : "Rien de planifié"}
                    </Tag>
                  </li>
                </ul>

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
