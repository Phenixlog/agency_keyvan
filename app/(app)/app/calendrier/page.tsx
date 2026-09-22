import Link from "next/link";
import { Ban, Check, ChevronLeft, ChevronRight, Download, ImageOff, MessageSquareText, PenLine, Settings2, Sparkles, Trash2, TextCursorInput, Undo2, Wand2 } from "lucide-react";
import { MigrationNotice } from "@/components/app/MigrationNotice";
import { CopyLink, CopyText } from "@/components/brand/BoardActions";
import { CreationPicker } from "@/components/calendar/CreationPicker";
import { BrandCard, ButtonLink, Card, CardHeader, Empty, Field, Input, Meta, Notice, Tag, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import {
  CHANNELS,
  getCalendarShare,
  gridRange,
  groupByDay,
  isValidDay,
  listEntries,
  listKeptOuts,
  monthGrid,
  nextEntry,
  ratioMismatch,
  resolveMonth,
  shiftMonth,
  toDay,
  validCadence,
  weekGaps,
  type EntryStatus,
  type EntryWithOut,
} from "@/lib/calendar";
import { isLlmConfigured } from "@/lib/llm/openrouter";
import { outImageUrl } from "@/lib/outs";
import { getWorkspace } from "@/lib/workspace";
import { accept, changeStatus, discard, edit, plan, propose, remove, share, unshare, writeCaption } from "./actions";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
// Day strings are calendar dates: format them in UTC so no time zone shifts them.
const MONTH_LABEL = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const DAY_LABEL = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const WEEK_LABEL = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

const STATUS_TONE: Record<EntryStatus, "neutral" | "success" | "danger" | "warning"> = { proposed: "warning", planned: "neutral", published: "success", canceled: "danger" };
const STATUS_LABEL: Record<EntryStatus, string> = { proposed: "Proposée par Brand OS", planned: "Planifiée", published: "Publiée", canceled: "Annulée" };

const MIGRATION = "exécutez supabase/migrations/0009_calendar_planning.sql dans Supabase → SQL Editor (contrôle : 8 lignes).";
const NOTICES = {
  planifie: ["success", "Publication planifiée."],
  modifie: ["success", "Publication modifiée. Si le client l’avait validée, elle lui est de nouveau soumise."],
  invalide: ["danger", "Date, canal ou création invalide : rien n’a été enregistré."],
  refuse: ["danger", "La base a refusé l’écriture : les règles d’accès de cette table sont absentes ou incomplètes. Rejouez en entier supabase/migrations/0004_calendar.sql dans Supabase → SQL Editor."],
  legende: ["success", "Légende rédigée dans la voix de la marque. Relisez-la avant de publier."],
  "legende-echec": ["danger", "La légende n’a pas pu être rédigée. Réessayez dans un instant."],
  propose: ["success", "Brand OS a proposé ce qui manque ce mois-ci. Rien ne compte tant que vous n’avez pas validé : gardez, modifiez ou écartez."],
  "propose-repli": ["warning", "Le modèle n’a pas répondu : proposition calculée depuis la cadence seule (jours répartis, angles en rotation). Relancez pour une proposition réfléchie."],
  "propose-complete": ["success", "Le rythme prévu est déjà tenu sur les jours restants : rien à proposer."],
  "propose-past": ["warning", "Ce mois est passé : il n’y a plus de jour à planifier."],
  "propose-nothing": ["warning", "Aucune proposition exploitable cette fois. Relancez dans un instant."],
  "propose-no-cadence": ["warning", "Sans rythme chiffré, il n’y a rien à calculer. Fixez-le avec l’expert (« 2 publications par semaine sur Instagram »), puis relancez."],
  "propose-migration-needed": ["warning", `Les propositions attendent une mise à jour de la base : ${MIGRATION}`],
  accepte: ["success", "Propositions validées : elles font maintenant partie du planning."],
  lien: ["success", "Lien de validation créé. Envoyez-le à votre client : il voit les publications à venir, valide ou demande un changement."],
  "lien-coupe": ["success", "Lien coupé : il ne s’ouvre plus."],
  "lien-migration": ["warning", `Le lien de validation attend une mise à jour de la base : ${MIGRATION}`],
} as const;

const EXPERT_RHYTHM = `/app/expert?message=${encodeURIComponent("Revoyons le rythme de publication de cette marque : quels canaux, et combien de publications par semaine sur chacun ?")}`;
const ON_BRAND_BUTTON = "inline-flex items-center gap-2 rounded-pill bg-card px-4 py-2 text-small font-semibold text-ink transition duration-(--duration-fast) ease-cimaise hover:-translate-y-px";
const SELECT = "w-full rounded-inner bg-soft px-4 py-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export default async function CalendrierPage({ searchParams }: { searchParams: Promise<{ mois?: string; ok?: string; creation?: string; jour?: string }> }) {
  const { brand, os } = await getWorkspace();
  const { mois, ok, creation, jour } = await searchParams;

  if (!brand) {
    return (
      <Empty title="Rien à planifier" action={<ButtonLink href="/onboarding">Analyser une marque</ButtonLink>}>
        Le calendrier planifie les créations gardées d’une marque, canal par canal.
      </Empty>
    );
  }

  const today = toDay(new Date());
  const selectedDay = jour && isValidDay(jour) ? jour : null;
  const month = resolveMonth(mois ?? selectedDay?.slice(0, 7), today);
  const { from, to } = gridRange(month);
  const [entries, kept, upcoming, link] = await Promise.all([listEntries(brand.id, from, to), listKeptOuts(brand.id), nextEntry(brand.id, today), getCalendarShare(brand.id)]);

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

  const strategy = os?.canon?.strategy;
  const cadence = validCadence(strategy?.cadence);
  const weeks = monthGrid(month);
  const byDay = groupByDay(entries);
  const inMonth = entries.filter((entry) => entry.scheduled_on.startsWith(month));
  const proposals = inMonth.filter((entry) => entry.status === "proposed");
  const reviewed = entries.filter((entry) => entry.status === "planned" && entry.scheduled_on >= today);
  const notice = ok && ok in NOTICES ? NOTICES[ok as keyof typeof NOTICES] : null;
  const llmReady = isLlmConfigured();
  const upcomingSrc = outImageUrl(upcoming?.out?.payload);
  const monthIsOpen = weeks.flat().some((d) => d.inMonth && d.day >= today);

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
      {link === undefined ? <Notice tone="warning">Les propositions de Brand OS et la validation par le client attendent une mise à jour de la base : {MIGRATION} Le reste du calendrier fonctionne.</Notice> : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-12">
        {/* ---- Le jour J : ce qu'il faut pour publier ---- */}
        <BrandCard className="lg:col-span-7">
          <div className="grid h-full min-h-40 content-center gap-6 md:grid-cols-[1fr_auto] md:items-center">
            <div className="grid gap-2">
              <span className="font-mono text-meta opacity-80">Prochaine publication</span>
              {upcoming ? (
                <>
                  <p className="font-display text-h1 first-letter:uppercase">{upcoming.scheduled_on === today ? "Aujourd’hui" : DAY_LABEL.format(asDate(upcoming.scheduled_on))}</p>
                  <span className="text-small opacity-80">
                    {CHANNELS[upcoming.channel]}
                    {upcoming.angle ? ` · ${upcoming.angle}` : upcoming.out?.payload?.brief ? ` · ${upcoming.out.payload.brief}` : ""}
                  </span>
                  <Readiness entry={upcoming} onBrand />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {upcoming.out ? (
                      <a href={`/api/outs/${upcoming.out.id}/download`} className={ON_BRAND_BUTTON}>
                        <Download size={16} strokeWidth={1.75} /> Télécharger le visuel
                      </a>
                    ) : (
                      <Link href={studioHref(upcoming)} className={ON_BRAND_BUTTON}>
                        <Wand2 size={16} strokeWidth={1.75} /> Créer le visuel
                      </Link>
                    )}
                    {upcoming.caption ? (
                      <CopyText text={upcoming.caption} label="Copier la légende" copiedLabel="Légende copiée" />
                    ) : llmReady ? (
                      <form action={writeCaption}>
                        <input type="hidden" name="entryId" value={upcoming.id} />
                        <input type="hidden" name="mois" value={month} />
                        <SubmitButton variant="soft" pendingLabel="Rédaction…">
                          <PenLine size={16} strokeWidth={1.75} /> Faire rédiger la légende
                        </SubmitButton>
                      </form>
                    ) : null}
                    <a href={`#${upcoming.id}`} className="inline-flex items-center gap-2 rounded-pill px-2 py-2 text-small underline underline-offset-4 opacity-80 hover:opacity-100">Voir le détail</a>
                  </div>
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

        {/* ---- Le rythme décidé avec l'expert, et ce que Brand OS propose pour le tenir ---- */}
        <Card className="lg:col-span-5">
          <CardHeader title="Le rythme" aside={<Meta>décidé avec l’expert</Meta>} />
          <div className="grid gap-4">
            {cadence.length ? (
              <ul className="flex flex-wrap gap-2">
                {cadence.map((c) => (
                  <li key={c.channel} className="rounded-pill bg-tint px-3 py-1 text-small text-ink">
                    {CHANNELS[c.channel]} <span className="font-mono text-meta text-mute">· {c.perWeek} / semaine</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-small text-mute">
                {strategy?.rhythm
                  ? `« ${strategy.rhythm} » — ce rythme n’est pas encore chiffré : le calendrier ne peut pas montrer les semaines incomplètes.`
                  : "Aucun rythme n’est fixé pour cette marque : le calendrier ne sait pas ce qui manque."}
              </p>
            )}
            {cadence.length && strategy?.rhythm ? <p className="text-small text-mute">{strategy.rhythm}</p> : null}

            <div className="flex flex-wrap items-center gap-2">
              {monthIsOpen ? (
                <form action={propose}>
                  <input type="hidden" name="mois" value={month} />
                  <SubmitButton pendingLabel="Brand OS compose le mois… (≈ 30 s)">
                    <Sparkles size={16} strokeWidth={1.75} /> {proposals.length ? "Proposer autre chose" : inMonth.length ? "Compléter le mois" : "Proposer le mois"}
                  </SubmitButton>
                </form>
              ) : null}
              <ButtonLink href={EXPERT_RHYTHM} variant="soft">
                <MessageSquareText size={16} strokeWidth={1.75} /> {cadence.length ? "Ajuster avec l’expert" : "Fixer le rythme avec l’expert"}
              </ButtonLink>
            </div>

            {proposals.length ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                <Meta className="mr-auto">{proposals.length} proposition{proposals.length > 1 ? "s" : ""} en attente</Meta>
                <form action={accept}>
                  <input type="hidden" name="mois" value={month} />
                  <SubmitButton variant="soft" pendingLabel="…">
                    <Check size={16} strokeWidth={1.75} /> Tout valider
                  </SubmitButton>
                </form>
                <form action={discard}>
                  <input type="hidden" name="mois" value={month} />
                  <SubmitButton variant="ghost" pendingLabel="…">Tout écarter</SubmitButton>
                </form>
              </div>
            ) : null}
          </div>
        </Card>

        {/* ---- La grille : on clique sur un jour pour planifier ---- */}
        <Card className="hidden md:block lg:col-span-12">
          <div className={`grid gap-px overflow-hidden rounded-inner bg-line ${cadence.length ? "grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,1.2fr)]" : "grid-cols-[repeat(7,minmax(0,1fr))]"}`}>
            {WEEKDAYS.map((weekday) => (
              <div key={weekday} className="bg-card px-2 py-2">
                <Meta>{weekday}</Meta>
              </div>
            ))}
            {cadence.length ? (
              <div className="bg-card px-2 py-2">
                <Meta>rythme tenu</Meta>
              </div>
            ) : null}
            {weeks.map((week) => (
              <WeekRow key={week[0].day} week={week} today={today} selectedDay={selectedDay} month={month} byDay={byDay} gaps={weekGaps(cadence, week.map((d) => d.day), entries)} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Meta>Cliquez sur un jour pour planifier.</Meta>
            <span className="inline-flex items-center gap-2 font-mono text-meta text-mute"><span className="inline-block h-3 w-6 rounded-tag bg-ink" /> planifiée</span>
            <span className="inline-flex items-center gap-2 font-mono text-meta text-mute"><span className="inline-block h-3 w-6 rounded-tag border border-dashed border-mute" /> proposée, à valider</span>
            <span className="inline-flex items-center gap-2 font-mono text-meta text-mute"><span className="inline-block h-3 w-6 rounded-tag bg-success-tint" /> publiée</span>
          </div>
        </Card>

        {/* ---- Planifier ---- */}
        <Card id="planifier" className="scroll-mt-4 lg:col-span-12">
          {/* The main gesture is a click on a day: the form only unfolds then, or on demand. */}
          <details open={Boolean(selectedDay)} className="group">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-4">
              <span className="text-title text-ink">{selectedDay ? `Planifier le ${DAY_LABEL.format(asDate(selectedDay))}` : "Planifier à la main"}</span>
              <Meta>
                {kept.length} création{kept.length > 1 ? "s" : ""} gardée{kept.length > 1 ? "s" : ""} · <span className="group-open:hidden">ouvrir</span><span className="hidden group-open:inline">fermer</span>
              </Meta>
            </summary>
          <form action={plan} className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="grid content-start gap-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Date">
                  <Input type="date" name="day" required defaultValue={selectedDay ?? today} min="2020-01-01" max="2100-12-31" />
                </Field>
                <Field label="Canal">
                  <select name="channel" required defaultValue={cadence[0]?.channel ?? "instagram"} className={SELECT}>
                    {Object.entries(CHANNELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Légende" hint={llmReady ? "Facultatif : Brand OS pourra la rédiger ensuite, dans la voix de la marque." : "Facultatif."}>
                <Textarea name="caption" rows={3} maxLength={2200} />
              </Field>
            </div>
            <div className="grid content-start gap-4">
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-small font-semibold text-ink">Création</legend>
                <CreationPicker creations={kept} selected={creation} />
                {kept.length ? null : <p className="text-small text-mute">Gardez une création dans le Studio pour pouvoir la planifier.</p>}
              </fieldset>
              <SubmitButton pendingLabel="Planification…" className="justify-self-start">Planifier</SubmitButton>
            </div>
          </form>
          </details>
        </Card>

        {/* ---- Le mois, semaine par semaine : la semaine en cours d'abord, le passé replié ---- */}
        <Card className="lg:col-span-12">
          <CardHeader title="Ce mois-ci" aside={<Meta>{inMonth.length} publication{inMonth.length > 1 ? "s" : ""}</Meta>} />
          {(() => {
            const sections = weeks.map((week) => {
              const days = week.map((d) => d.day);
              const rows = inMonth.filter((entry) => days.includes(entry.scheduled_on));
              return { days, rows, over: days[6] < today, gaps: weekGaps(cadence, days, entries) };
            });
            const ahead = sections.filter((w) => !w.over && (w.rows.length || w.gaps.length));
            const past = sections.filter((w) => w.over && w.rows.length);
            const render = (w: (typeof sections)[number]) => (
              <section key={w.days[0]} className="grid gap-2">
                <div className="flex flex-wrap items-center gap-2 border-b border-line pb-2">
                  <Meta className="mr-auto text-ink">Semaine du {WEEK_LABEL.format(asDate(w.days[0]))}</Meta>
                  {w.over
                    ? null
                    : w.gaps.map((gap) => (
                        <Tag key={gap.channel} tone={gap.planned >= gap.expected ? "success" : "warning"}>
                          {CHANNELS[gap.channel]} {gap.planned}/{gap.expected}
                        </Tag>
                      ))}
                </div>
                {w.rows.length ? (
                  <ul>
                    {w.rows.map((entry) => (
                      <EntryRow key={entry.id} entry={entry} month={month} kept={kept} llmReady={llmReady} />
                    ))}
                  </ul>
                ) : (
                  <p className="py-2 text-small text-mute">Rien de planifié cette semaine.</p>
                )}
              </section>
            );
            if (!ahead.length && !past.length) return <p className="text-small text-mute">Aucune publication planifiée ce mois-ci.</p>;
            return (
              <div className="grid gap-6">
                {ahead.map(render)}
                {past.length ? (
                  <details className="group grid gap-6">
                    <summary className="cursor-pointer list-none font-mono text-meta text-mute transition duration-(--duration-fast) ease-cimaise hover:text-ink">
                      <span className="group-open:hidden">Voir les semaines passées ({past.reduce((n, w) => n + w.rows.length, 0)} publication{past.reduce((n, w) => n + w.rows.length, 0) > 1 ? "s" : ""})</span>
                      <span className="hidden group-open:inline">Masquer les semaines passées</span>
                    </summary>
                    {past.map(render)}
                  </details>
                ) : null}
              </div>
            );
          })()}
        </Card>

        {/* ---- Faire valider par le client ---- */}
        {link !== undefined ? (
          <Card id="validation" className="scroll-mt-4 lg:col-span-12">
            <CardHeader
              title="Faire valider par le client"
              aside={
                reviewed.length ? (
                  <Meta>
                    {reviewed.filter((e) => e.client_status === "approved").length} validée(s) · {reviewed.filter((e) => e.client_status === "changes").length} à revoir · {reviewed.filter((e) => (e.client_status ?? "pending") === "pending").length} en attente
                  </Meta>
                ) : undefined
              }
            />
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <p className="max-w-[70ch] text-small text-mute">
                Un lien, sans compte à créer : votre client voit les publications planifiées à venir (visuel, date, canal, légende), valide chacune ou demande un changement. Il ne voit ni les propositions en attente, ni les briefs, ni les règles de la marque.
              </p>
              <div className="flex flex-wrap gap-2">
                {link ? (
                  <>
                    <CopyLink path={`/p/planning/${link.token}`} />
                    <ButtonLink href={`/p/planning/${link.token}`} target="_blank" variant="soft">Ouvrir</ButtonLink>
                    <form action={unshare}>
                      <input type="hidden" name="mois" value={month} />
                      <SubmitButton variant="ghost" pendingLabel="…">Couper le lien</SubmitButton>
                    </form>
                  </>
                ) : (
                  <form action={share}>
                    <input type="hidden" name="mois" value={month} />
                    <SubmitButton variant="soft" pendingLabel="Création…">Créer le lien de validation</SubmitButton>
                  </form>
                )}
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

/** A publication can go out when it has its visual and its caption. */
const isReady = (entry: EntryWithOut) => Boolean(entry.out && entry.caption);

/** The Studio, with the idea (or the angle) as the brief, and the planned day so the creation can be attached back. */
const studioHref = (entry: EntryWithOut) => `/app/studio?brief=${encodeURIComponent(entry.idea || entry.angle || "")}`;

/** What is still missing before publishing: nothing to say when all is there. */
function Readiness({ entry, onBrand = false }: { entry: EntryWithOut; onBrand?: boolean }) {
  const missing = [!entry.out && "le visuel", !entry.caption && "la légende"].filter(Boolean) as string[];
  if (!missing.length) return onBrand ? <span className="font-mono text-meta opacity-80">Prête à publier</span> : <Tag tone="success">Prête à publier</Tag>;
  const label = `Il manque ${missing.join(" et ")}`;
  if (onBrand) {
    return (
      <span className="inline-flex items-center gap-2 font-mono text-meta opacity-90">
        {!entry.out ? <ImageOff size={14} strokeWidth={1.75} /> : <TextCursorInput size={14} strokeWidth={1.75} />} {label}
      </span>
    );
  }
  return <Tag tone="warning">{label}</Tag>;
}

function WeekRow({
  week,
  today,
  selectedDay,
  month,
  byDay,
  gaps,
}: {
  week: readonly { day: string; inMonth: boolean }[];
  today: string;
  selectedDay: string | null;
  month: string;
  byDay: Map<string, EntryWithOut[]>;
  gaps: readonly { channel: keyof typeof CHANNELS; expected: number; planned: number }[];
}) {
  const over = week[6].day < today;
  return (
    <>
      {week.map(({ day, inMonth }) => (
        <div key={day} className={`grid min-h-28 content-start gap-1 p-2 ${day === selectedDay ? "bg-tint-strong" : day === today ? "bg-tint" : inMonth ? "bg-card" : "bg-shell"}`}>
          <Link
            href={`/app/calendrier?mois=${month}&jour=${day}#planifier`}
            aria-label={`Planifier le ${DAY_LABEL.format(asDate(day))}`}
            className={`justify-self-start rounded-tag px-1 font-mono text-meta transition duration-(--duration-fast) ease-cimaise hover:bg-ink hover:text-card ${inMonth ? "text-ink" : "text-mute"}`}
          >
            {Number(day.slice(8))}
          </Link>
          {(byDay.get(day) ?? []).map((entry) => {
            const src = outImageUrl(entry.out?.payload);
            const tone =
              entry.status === "published" ? "bg-success-tint text-success" : entry.status === "canceled" ? "bg-soft text-mute line-through" : entry.status === "proposed" ? "border border-dashed border-mute bg-card text-mute" : "bg-ink text-card";
            return (
              <a key={entry.id} href={`#${entry.id}`} title={entry.angle || entry.out?.payload?.brief || entry.idea || undefined} className={`flex items-center gap-1 overflow-hidden rounded-tag font-mono text-meta ${tone}`}>
                <span className="relative size-6 flex-none overflow-hidden bg-tint">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                  ) : null}
                </span>
                <span className="truncate pr-1">{CHANNELS[entry.channel]}</span>
              </a>
            );
          })}
        </div>
      ))}
      {gaps.length ? (
        <div className="grid content-start gap-1 bg-card p-2">
          {gaps.map((gap) => (
            <span key={gap.channel} className={`truncate font-mono text-meta ${gap.planned >= gap.expected ? "text-success" : over ? "text-mute" : "text-warning"}`}>
              {CHANNELS[gap.channel]} {gap.planned}/{gap.expected}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}

function EntryRow({ entry, month, kept, llmReady }: { entry: EntryWithOut; month: string; kept: Awaited<ReturnType<typeof listKeptOuts>>; llmReady: boolean }) {
  const src = outImageUrl(entry.out?.payload);
  const proposed = entry.status === "proposed";
  const mismatch = entry.out ? ratioMismatch(entry.channel, entry.out.payload?.aspect_ratio) : null;
  // The attached creation stays selectable even if it is no longer "kept" in the Studio.
  const creations = entry.out && !kept.some((out) => out.id === entry.out?.id) ? [{ id: entry.out.id, payload: entry.out.payload }, ...kept] : kept;
  const hidden = (
    <>
      <input type="hidden" name="entryId" value={entry.id} />
      <input type="hidden" name="mois" value={month} />
    </>
  );

  return (
    <li id={entry.id} className={`grid scroll-mt-4 gap-4 border-t border-line py-4 first:border-t-0 md:grid-cols-[4rem_minmax(0,1fr)] ${proposed ? "rounded-inner border border-dashed border-mute px-4 first:border-t" : ""}`}>
      <div className="relative size-16 overflow-hidden rounded-inner bg-tint">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
        ) : null}
      </div>
      <div className="grid gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-title text-ink first-letter:uppercase">{DAY_LABEL.format(asDate(entry.scheduled_on))}</span>
          <Tag>{CHANNELS[entry.channel]}</Tag>
          <Tag tone={STATUS_TONE[entry.status]}>{STATUS_LABEL[entry.status]}</Tag>
          {entry.client_status === "approved" ? <Tag tone="success">Validée par le client</Tag> : null}
          {entry.client_status === "changes" ? <Tag tone="danger">Changement demandé</Tag> : null}
        </span>
        {entry.angle ? <Meta>Angle · {entry.angle}</Meta> : null}
        {!proposed && entry.status === "planned" ? <Readiness entry={entry} /> : null}
        {entry.client_status === "changes" && entry.client_comment ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-inner bg-danger-tint px-4 py-3">
            <p className="text-small text-danger">Le client : « {entry.client_comment} »</p>
            {/* The end client's words are the best signal to adjust the brand: hand them to the expert as they are. */}
            <Link
              href={`/app/expert?message=${encodeURIComponent(`Le client a demandé un changement sur la publication ${CHANNELS[entry.channel]} du ${DAY_LABEL.format(asDate(entry.scheduled_on))} : « ${entry.client_comment} ». Qu’est-ce que ça dit de la marque, et que faut-il ajuster ?`)}`}
              className="inline-flex items-center gap-2 rounded-pill bg-card px-3 py-1.5 text-small font-semibold text-ink transition duration-(--duration-fast) ease-cimaise hover:-translate-y-px"
            >
              <MessageSquareText size={14} strokeWidth={1.75} /> En parler à l’expert
            </Link>
          </div>
        ) : null}
        <p className="whitespace-pre-line text-small text-mute">
          {entry.caption || (entry.out ? entry.out.payload?.brief : entry.idea ? `Visuel à créer : ${entry.idea}` : "") || "Pas encore de légende."}
        </p>
        {mismatch ? (
          <Meta className="text-warning">
            Ce visuel est en {entry.out?.payload?.aspect_ratio} : {CHANNELS[entry.channel]} l’affiche sans recadrage en {mismatch.join(", ")}.
          </Meta>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {proposed ? (
            <>
              <form action={accept}>
                {hidden}
                <SubmitButton variant="soft" pendingLabel="…">
                  <Check size={16} strokeWidth={1.75} /> Valider
                </SubmitButton>
              </form>
              {!entry.out ? (
                <ButtonLink href={studioHref(entry)} variant="soft">
                  <Wand2 size={16} strokeWidth={1.75} /> Créer ce visuel
                </ButtonLink>
              ) : null}
              <form action={remove}>
                {hidden}
                <SubmitButton variant="ghost" pendingLabel="…">Écarter</SubmitButton>
              </form>
            </>
          ) : (
            <>
              {entry.out ? (
                <a href={`/api/outs/${entry.out.id}/download`} className="inline-flex items-center gap-2 rounded-pill bg-soft px-4 py-2 text-small font-semibold text-ink transition duration-(--duration-fast) ease-cimaise hover:bg-line">
                  <Download size={16} strokeWidth={1.75} /> Télécharger
                </a>
              ) : entry.status === "planned" ? (
                <ButtonLink href={studioHref(entry)} variant="soft">
                  <Wand2 size={16} strokeWidth={1.75} /> Créer le visuel
                </ButtonLink>
              ) : null}
              {entry.caption ? (
                <CopyText text={entry.caption} label="Copier la légende" copiedLabel="Légende copiée" />
              ) : llmReady && entry.status === "planned" ? (
                <form action={writeCaption}>
                  {hidden}
                  <SubmitButton variant="soft" pendingLabel="Rédaction…">
                    <PenLine size={16} strokeWidth={1.75} /> Faire rédiger la légende
                  </SubmitButton>
                </form>
              ) : null}
              <form action={changeStatus}>
                {hidden}
                <input type="hidden" name="status" value={entry.status === "planned" ? "published" : "planned"} />
                {/* Publishing is the end of the road: it only stands out once the publication is ready. */}
                <SubmitButton variant={entry.status === "planned" && !isReady(entry) ? "ghost" : "soft"} pendingLabel="…">
                  {entry.status === "planned" ? <Check size={16} strokeWidth={1.75} /> : <Undo2 size={16} strokeWidth={1.75} />}
                  {entry.status === "planned" ? "Marquer publiée" : "Replanifier"}
                </SubmitButton>
              </form>
            </>
          )}
        </div>

        <details className="group">
          <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-pill px-2 py-2 text-small text-mute transition duration-(--duration-fast) ease-cimaise hover:text-ink">
            <Settings2 size={16} strokeWidth={1.75} />
            <span className="group-open:hidden">Modifier</span>
            <span className="hidden group-open:inline">Fermer la modification</span>
          </summary>
          <div className="mt-4 grid gap-4">
            <form action={edit} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              {hidden}
              <div className="grid content-start gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Date">
                    <Input type="date" name="day" required defaultValue={entry.scheduled_on} min="2020-01-01" max="2100-12-31" />
                  </Field>
                  <Field label="Canal">
                    <select name="channel" required defaultValue={entry.channel} className={SELECT}>
                      {Object.entries(CHANNELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Légende">
                  <Textarea name="caption" rows={4} maxLength={2200} defaultValue={entry.caption ?? ""} />
                </Field>
              </div>
              <div className="grid content-start gap-4">
                <fieldset className="grid gap-2">
                  <legend className="mb-2 text-small font-semibold text-ink">Création</legend>
                  <CreationPicker creations={creations} selected={entry.out?.id} />
                </fieldset>
                <SubmitButton variant="soft" pendingLabel="Enregistrement…" className="justify-self-start">Enregistrer</SubmitButton>
              </div>
            </form>
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              {llmReady ? (
                <form action={writeCaption}>
                  {hidden}
                  <SubmitButton variant="soft" pendingLabel="Rédaction…">
                    <PenLine size={16} strokeWidth={1.75} /> {entry.caption ? "Faire réécrire la légende" : "Faire rédiger la légende"}
                  </SubmitButton>
                </form>
              ) : null}
              {entry.status === "planned" ? (
                <form action={changeStatus}>
                  {hidden}
                  <input type="hidden" name="status" value="canceled" />
                  <SubmitButton variant="ghost" pendingLabel="…">
                    <Ban size={16} strokeWidth={1.75} /> Annuler la publication
                  </SubmitButton>
                </form>
              ) : null}
              <form action={remove}>
                {hidden}
                <SubmitButton variant="ghost" pendingLabel="…">
                  <Trash2 size={16} strokeWidth={1.75} /> Retirer du calendrier
                </SubmitButton>
              </form>
            </div>
          </div>
        </details>
      </div>
    </li>
  );
}
