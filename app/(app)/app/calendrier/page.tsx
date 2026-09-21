import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, PenLine, Trash2, Undo2 } from "lucide-react";
import { MigrationNotice } from "@/components/app/MigrationNotice";
import { BrandCard, ButtonLink, Card, CardHeader, Empty, Field, Input, Meta, Notice, Tag, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import {
  CHANNELS,
  createEntry,
  deleteEntry,
  gridRange,
  groupByDay,
  listEntries,
  listKeptOuts,
  monthGrid,
  nextEntry,
  resolveMonth,
  setEntryStatus,
  shiftMonth,
  suggestCaption,
  toDay,
  type EntryStatus,
} from "@/lib/calendar";
import { isLlmConfigured } from "@/lib/llm/openrouter";
import { outImageUrl } from "@/lib/outs";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
// Day strings are calendar dates: format them in UTC so no time zone shifts them.
const MONTH_LABEL = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const DAY_LABEL = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

const STATUS_TONE: Record<EntryStatus, "neutral" | "success" | "danger"> = { planned: "neutral", published: "success", canceled: "danger" };
const STATUS_LABEL: Record<EntryStatus, string> = { planned: "Planifiée", published: "Publiée", canceled: "Annulée" };

const NOTICES = {
  planifie: ["success", "Publication planifiée."],
  invalide: ["danger", "Date, canal ou création invalide : rien n’a été planifié."],
  refuse: ["danger", "La base a refusé l’écriture : les règles d’accès de cette table sont absentes ou incomplètes. Rejouez en entier supabase/migrations/0004_calendar_expert.sql dans Supabase → SQL Editor."],
  legende: ["success", "Légende rédigée dans la voix de la marque. Relisez-la avant de publier."],
  "legende-echec": ["danger", "La légende n’a pas pu être rédigée. Réessayez dans un instant."],
} as const;

export default async function CalendrierPage({ searchParams }: { searchParams: Promise<{ mois?: string; ok?: string }> }) {
  const { brand } = await getWorkspace();
  const { mois, ok } = await searchParams;

  if (!brand) {
    return (
      <Empty title="Rien à planifier" action={<ButtonLink href="/onboarding">Analyser une marque</ButtonLink>}>
        Le calendrier planifie les créations gardées d’une marque, canal par canal.
      </Empty>
    );
  }

  const today = toDay(new Date());
  const month = resolveMonth(mois, today);
  const { from, to } = gridRange(month);
  const [entries, kept, upcoming] = await Promise.all([listEntries(brand.id, from, to), listKeptOuts(brand.id), nextEntry(brand.id, today)]);

  if (entries === null) {
    return (
      <>
        <header>
          <Meta>Calendrier · {brand.name}</Meta>
          <h1 className="mt-2 font-display text-display text-ink">Le planning</h1>
        </header>
        <MigrationNotice feature="Le calendrier" />
      </>
    );
  }

  async function plan(formData: FormData) {
    "use server";
    const { brand, userId } = await getWorkspace();
    if (!brand) redirect("/app");
    const day = String(formData.get("day") || "");
    const outcome = await createEntry({
      brand,
      userId,
      day,
      channel: String(formData.get("channel") || ""),
      outId: String(formData.get("outId") || "") || null,
      caption: String(formData.get("caption") || ""),
    });
    // Land on the month of the new entry, so it is visible.
    redirect(
      outcome === "ok"
        ? `/app/calendrier?mois=${day.slice(0, 7)}&ok=planifie`
        : `/app/calendrier?ok=${outcome === "forbidden" ? "refuse" : "invalide"}`
    );
  }

  async function changeStatus(formData: FormData) {
    "use server";
    const { brand } = await getWorkspace();
    if (!brand) redirect("/app");
    await setEntryStatus(brand.id, String(formData.get("entryId")), String(formData.get("status")));
    redirect(`/app/calendrier?mois=${resolveMonth(String(formData.get("mois") || ""), toDay(new Date()))}`);
  }

  async function remove(formData: FormData) {
    "use server";
    const { brand } = await getWorkspace();
    if (!brand) redirect("/app");
    await deleteEntry(brand.id, String(formData.get("entryId")));
    redirect(`/app/calendrier?mois=${resolveMonth(String(formData.get("mois") || ""), toDay(new Date()))}`);
  }

  async function writeCaption(formData: FormData) {
    "use server";
    const { brand, os, mega } = await getWorkspace();
    if (!brand) redirect("/app");
    const outcome = await suggestCaption({
      brandId: brand.id,
      entryId: String(formData.get("entryId")),
      brandName: brand.name,
      summary: os?.summary ?? "",
      rules: mega?.rules ?? [],
    });
    const month = resolveMonth(String(formData.get("mois") || ""), toDay(new Date()));
    redirect(`/app/calendrier?mois=${month}&ok=${outcome === "ok" ? "legende" : "legende-echec"}`);
  }

  const byDay = groupByDay(entries);
  const inMonth = entries.filter((entry) => entry.scheduled_on.startsWith(month));
  const notice = ok && ok in NOTICES ? NOTICES[ok as keyof typeof NOTICES] : null;
  const llmReady = isLlmConfigured();
  const upcomingSrc = outImageUrl(upcoming?.out?.payload);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Meta>Calendrier · {brand.name}</Meta>
          <h1 className="mt-2 font-display text-display text-ink first-letter:uppercase">{MONTH_LABEL.format(asDate(`${month}-01`))}</h1>
        </div>
        <nav aria-label="Changer de mois" className="flex items-center gap-1 rounded-pill bg-card p-1">
          <Link href={`/app/calendrier?mois=${shiftMonth(month, -1)}`} aria-label="Mois précédent" className="grid size-10 place-items-center rounded-pill text-mute transition duration-(--duration-fast) ease-cimaise hover:bg-soft hover:text-ink">
            <ChevronLeft size={18} strokeWidth={1.75} />
          </Link>
          <Link href="/app/calendrier" className="rounded-pill px-4 py-2 text-small text-mute transition duration-(--duration-fast) ease-cimaise hover:text-ink">
            Aujourd’hui
          </Link>
          <Link href={`/app/calendrier?mois=${shiftMonth(month, 1)}`} aria-label="Mois suivant" className="grid size-10 place-items-center rounded-pill text-mute transition duration-(--duration-fast) ease-cimaise hover:bg-soft hover:text-ink">
            <ChevronRight size={18} strokeWidth={1.75} />
          </Link>
        </nav>
      </header>

      {notice ? <Notice tone={notice[0]}>{notice[1]}</Notice> : null}

      <div className="grid gap-4 lg:grid-cols-12">
        <BrandCard className="lg:col-span-7">
          <div className="grid h-full min-h-40 content-center gap-6 md:grid-cols-[1fr_auto] md:items-center">
            <div className="grid gap-2">
              <span className="font-mono text-meta opacity-80">Prochaine publication</span>
              {upcoming ? (
                <>
                  <p className="font-display text-h1 first-letter:uppercase">{DAY_LABEL.format(asDate(upcoming.scheduled_on))}</p>
                  <span className="text-small opacity-80">
                    {CHANNELS[upcoming.channel]}
                    {upcoming.out?.payload?.brief ? ` · ${upcoming.out.payload.brief}` : ""}
                  </span>
                </>
              ) : (
                <p className="max-w-[28ch] font-display text-h1">Rien de planifié. Le mur attend sa prochaine sortie.</p>
              )}
            </div>
            {upcomingSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={upcomingSrc} alt="" className="size-32 rounded-inner object-cover" />
            ) : null}
          </div>
        </BrandCard>

        <Card className="lg:col-span-5">
          <CardHeader title="Planifier" aside={<Meta>{kept.length} création{kept.length > 1 ? "s" : ""} gardée{kept.length > 1 ? "s" : ""}</Meta>} />
          <form action={plan} className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Date">
                <Input type="date" name="day" required defaultValue={today} min="2020-01-01" max="2100-12-31" />
              </Field>
              <Field label="Canal">
                <select name="channel" required defaultValue="instagram" className="w-full rounded-inner bg-soft px-4 py-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                  {Object.entries(CHANNELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Création" hint={kept.length ? undefined : "Gardez une création dans le Studio pour pouvoir la planifier."}>
              <select name="outId" defaultValue="" className="w-full rounded-inner bg-soft px-4 py-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                <option value="">Aucune — simple idée de publication</option>
                {kept.map((out) => (
                  <option key={out.id} value={out.id}>{(out.payload?.brief || "Sans brief").slice(0, 70)}</option>
                ))}
              </select>
            </Field>
            <Field label="Légende" hint={llmReady ? "Facultatif : Brand OS pourra la rédiger ensuite, dans la voix de la marque." : "Facultatif."}>
              <Textarea name="caption" rows={3} maxLength={2200} />
            </Field>
            <SubmitButton pendingLabel="Planification…" className="justify-self-start">Planifier</SubmitButton>
          </form>
        </Card>

        <Card className="hidden lg:col-span-12 lg:block">
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-inner bg-line">
            {WEEKDAYS.map((weekday) => (
              <div key={weekday} className="bg-card px-2 py-2">
                <Meta>{weekday}</Meta>
              </div>
            ))}
            {monthGrid(month).flat().map(({ day, inMonth }) => (
              <div key={day} className={`grid min-h-24 content-start gap-1 p-2 ${day === today ? "bg-tint" : inMonth ? "bg-card" : "bg-shell"}`}>
                <Meta className={inMonth ? "text-ink" : ""}>{Number(day.slice(8))}</Meta>
                {(byDay.get(day) ?? []).map((entry) => (
                  <a key={entry.id} href={`#${entry.id}`} className={`truncate rounded-tag px-2 py-1 font-mono text-meta ${entry.status === "published" ? "bg-success-tint text-success" : entry.status === "canceled" ? "bg-soft text-mute line-through" : "bg-ink text-card"}`}>
                    {CHANNELS[entry.channel]}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-12">
          <CardHeader title="Ce mois-ci" aside={<Meta>{inMonth.length} publication{inMonth.length > 1 ? "s" : ""}</Meta>} />
          {inMonth.length ? (
            <ul>
              {inMonth.map((entry) => {
                const src = outImageUrl(entry.out?.payload);
                return (
                  <li key={entry.id} id={entry.id} className="grid gap-4 border-t border-line py-4 first:border-t-0 first:pt-0 md:grid-cols-[4rem_1fr_auto] md:items-start">
                    <div className="size-16 overflow-hidden rounded-inner bg-tint">
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
                      ) : null}
                    </div>
                    <div className="grid gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-title text-ink first-letter:uppercase">{DAY_LABEL.format(asDate(entry.scheduled_on))}</span>
                        <Tag>{CHANNELS[entry.channel]}</Tag>
                        <Tag tone={STATUS_TONE[entry.status]}>{STATUS_LABEL[entry.status]}</Tag>
                      </span>
                      <p className="whitespace-pre-line text-small text-mute">{entry.caption || entry.out?.payload?.brief || "Pas encore de légende."}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      {llmReady ? (
                        <form action={writeCaption}>
                          <input type="hidden" name="entryId" value={entry.id} />
                          <input type="hidden" name="mois" value={month} />
                          <SubmitButton variant="soft" pendingLabel="Rédaction…">
                            <PenLine size={16} strokeWidth={1.75} /> {entry.caption ? "Réécrire" : "Rédiger la légende"}
                          </SubmitButton>
                        </form>
                      ) : null}
                      <form action={changeStatus}>
                        <input type="hidden" name="entryId" value={entry.id} />
                        <input type="hidden" name="mois" value={month} />
                        <input type="hidden" name="status" value={entry.status === "planned" ? "published" : "planned"} />
                        <SubmitButton variant="soft" pendingLabel="…">
                          {entry.status === "planned" ? <Check size={16} strokeWidth={1.75} /> : <Undo2 size={16} strokeWidth={1.75} />}
                          {entry.status === "planned" ? "Marquer publiée" : "Replanifier"}
                        </SubmitButton>
                      </form>
                      <form action={remove}>
                        <input type="hidden" name="entryId" value={entry.id} />
                        <input type="hidden" name="mois" value={month} />
                        <SubmitButton variant="ghost" pendingLabel="…">
                          <Trash2 size={16} strokeWidth={1.75} /> Retirer
                        </SubmitButton>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-small text-mute">Aucune publication planifiée ce mois-ci.</p>
          )}
        </Card>
      </div>
    </>
  );
}
