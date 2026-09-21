import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, MessageSquareText } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { BrandCard, Card, Meta, Notice, Tag, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { CHANNELS, loadPublicPlanning, toDay } from "@/lib/calendar";
import { brandStyle } from "@/lib/tokens";
import { review } from "./actions";

export const dynamic = "force-dynamic";

// A validation link is for the client who was given it, not for search engines.
export const metadata: Metadata = { title: "Planning à valider", robots: { index: false, follow: false } };

const DAY_LABEL = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

export default async function PublicPlanning({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ ok?: string }> }) {
  const { token } = await params;
  const { ok } = await searchParams;
  const planning = await loadPublicPlanning(token, toDay(new Date()));
  // Unknown, malformed and revoked links all look the same from outside.
  if (!planning) notFound();

  const pending = planning.entries.filter((entry) => entry.clientStatus === "pending").length;

  return (
    <main className="min-h-screen p-4 md:p-8" style={brandStyle(planning.color) as CSSProperties}>
      <div className="mx-auto grid max-w-4xl grid-cols-[minmax(0,1fr)] gap-4 rounded-shell bg-shell p-4 md:p-6">
        <span className="px-2 font-mono text-meta text-mute">Planning de publication · à valider</span>

        <BrandCard>
          <div className="grid gap-2">
            <span className="font-mono text-meta opacity-80">{planning.brandName}</span>
            <p className="max-w-[30ch] font-display text-h1">
              {planning.entries.length
                ? pending
                  ? `${pending} publication${pending > 1 ? "s" : ""} attend${pending > 1 ? "ent" : ""} votre avis.`
                  : "Vous avez donné votre avis sur tout. Merci."
                : "Aucune publication à venir pour l’instant."}
            </p>
            <span className="text-small opacity-80">Pour chacune : validez, ou dites ce qu’il faut changer. Vous pouvez revenir sur votre avis tant que la publication n’est pas sortie.</span>
          </div>
        </BrandCard>

        {ok === "merci" ? <Notice tone="success">C’est noté, merci.</Notice> : null}
        {ok === "echec" ? <Notice tone="danger">Votre avis n’a pas pu être enregistré : cette publication a peut-être changé entre-temps. Rechargez la page.</Notice> : null}

        {planning.entries.map((entry) => (
          <Card key={entry.id} id={entry.id} className="scroll-mt-4">
            <div className="grid gap-6 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
              <div className="relative aspect-square overflow-hidden rounded-inner bg-tint">
                {entry.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={entry.imageUrl} alt="Visuel de la publication" loading="lazy" className="absolute inset-0 size-full object-contain" />
                ) : (
                  <span className="absolute inset-0 grid place-items-center px-4 text-center font-mono text-meta text-mute">Visuel en cours de création</span>
                )}
              </div>
              <div className="grid content-start gap-4">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-h2 text-ink first-letter:uppercase">{DAY_LABEL.format(asDate(entry.day))}</span>
                  <Tag>{CHANNELS[entry.channel]}</Tag>
                  {entry.clientStatus === "approved" ? <Tag tone="success">Validée</Tag> : null}
                  {entry.clientStatus === "changes" ? <Tag tone="warning">Changement demandé</Tag> : null}
                </span>
                <div className="grid gap-1">
                  <Meta>Légende</Meta>
                  <p className="whitespace-pre-line text-body text-ink">{entry.caption || "La légende n’est pas encore rédigée."}</p>
                </div>
                {entry.clientStatus === "changes" && entry.clientComment ? (
                  <div className="grid gap-1">
                    <Meta>Votre demande</Meta>
                    <p className="text-small text-mute">« {entry.clientComment} »</p>
                  </div>
                ) : null}

                <div className="grid gap-4 border-t border-line pt-4">
                  {entry.clientStatus !== "approved" ? (
                    <form action={review}>
                      <input type="hidden" name="token" value={token} />
                      <input type="hidden" name="entryId" value={entry.id} />
                      <input type="hidden" name="verdict" value="approved" />
                      <SubmitButton pendingLabel="Enregistrement…">
                        <Check size={16} strokeWidth={1.75} /> Valider cette publication
                      </SubmitButton>
                    </form>
                  ) : null}
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-small font-semibold text-ink">
                      <MessageSquareText size={16} strokeWidth={1.75} /> {entry.clientStatus === "approved" ? "Finalement, demander un changement" : "Demander un changement"}
                    </summary>
                    <form action={review} className="mt-4 grid gap-2">
                      <input type="hidden" name="token" value={token} />
                      <input type="hidden" name="entryId" value={entry.id} />
                      <input type="hidden" name="verdict" value="changes" />
                      <Textarea name="comment" rows={3} required maxLength={500} aria-label="Ce qu’il faut changer" placeholder="Ce qu’il faut changer : la date, le visuel, un mot de la légende…" defaultValue={entry.clientStatus === "changes" ? (entry.clientComment ?? "") : ""} />
                      <SubmitButton variant="soft" pendingLabel="Envoi…" className="justify-self-start">Envoyer la demande</SubmitButton>
                    </form>
                  </details>
                </div>
              </div>
            </div>
          </Card>
        ))}

        <footer className="flex items-center justify-center gap-2 py-4 font-mono text-meta text-mute">
          <LogoMark size={20} /> Planning préparé avec Brand OS
        </footer>
      </div>
    </main>
  );
}
