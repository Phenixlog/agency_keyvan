import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { MessageSquareText, Users, X } from "lucide-react";
import type { BoardData } from "@/lib/brand-board";
import { FREQUENCIES, SLIDERS, parsePalette, parsePillar } from "@/lib/brand-os/model";
import { onBrand } from "@/lib/tokens";
import { Meta } from "@/components/ui";
import { CHANNELS, validCadence } from "@/lib/calendar/model";

/**
 * La planche de marque : l'identité du client, faite pour être montrée. Lecture seule — on la fait
 * évoluer en parlant à l'expert (liens « Revoir » quand `editable`). Sert l'écran Marque et le lien public.
 */

// The dominant colour takes more of the strip than the accents, like on a printed chart.
const SWATCH_WEIGHTS = [4, 3, 2, 2, 1];
const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function Section({ title, review, editable, className = "", children }: { title: string; review?: string; editable: boolean; className?: string; children: ReactNode }) {
  return (
    <section className={`grid min-w-0 content-start gap-4 rounded-card bg-card p-6 break-inside-avoid md:p-8 ${className}`}>
      <header className="flex items-center justify-between gap-4">
        <h2 className="font-mono text-meta uppercase text-mute">{title}</h2>
        {editable && review ? (
          <Link
            href={`/app/expert?message=${encodeURIComponent(review)}`}
            className="inline-flex items-center gap-2 text-small text-mute transition duration-(--duration-fast) ease-cimaise hover:text-ink print:hidden"
          >
            <MessageSquareText size={14} strokeWidth={1.75} /> Revoir avec l’expert
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function WallImage({ image, className, eager = false }: { image: { src: string; alt: string }; className: string; eager?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-card bg-tint ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.src} alt={image.alt} loading={eager ? "eager" : "lazy"} className="absolute inset-0 size-full object-cover" />
    </div>
  );
}

export function BrandBoard({ board, editable = false }: { board: BoardData; editable?: boolean }) {
  const { canon } = board;
  const palette = parsePalette(canon.visual.palette);
  const [hero, ...rest] = board.wall;
  let host: string | null = null;
  try {
    host = board.siteUrl ? new URL(board.siteUrl).hostname.replace(/^www\./, "") : null;
  } catch {
    host = null;
  }

  return (
    <article className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {/* ---- Ouverture ---- */}
      <div className="grid gap-4 lg:grid-cols-12">
        <header className="grid content-between gap-8 rounded-card bg-card p-6 md:p-10 lg:col-span-8">
          <div className="flex items-center gap-4">
            {board.logo ? (
              // The client's own mark, read from its site. Plain <img>: an arbitrary third-party host.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={board.logo} alt="" className="size-14 flex-none rounded-inner bg-soft object-contain p-1" />
            ) : null}
            <p className="font-mono text-meta text-mute">
              Brand OS v{board.version} · {DATE.format(new Date(board.analysedAt))}
              {host ? ` · d’après ${host}` : ""}
            </p>
          </div>
          <div className="grid gap-6">
            <h1 className="font-display text-display text-ink md:text-hero">
              <span className="highlighter">{board.name}</span>
            </h1>
            <p className="max-w-[28ch] font-display text-h1 text-ink">{canon.promise}</p>
          </div>
        </header>

        <div className="relative grid min-h-64 content-end overflow-hidden rounded-card bg-brand p-6 text-on-brand transition-colors duration-(--duration-retint) ease-cimaise md:p-8 lg:col-span-4">
          <span aria-hidden className="hatch pointer-events-none absolute -right-16 -top-16 size-72 rounded-full opacity-15" />
          <p className="relative font-mono text-meta uppercase opacity-80">Ton</p>
          <ul className="relative mt-2 grid">
            {canon.tone.map((word) => (
              <li key={word} className="font-display text-h1 first-letter:uppercase">{word}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* ---- Palette : de vraies couleurs, pas des mots ---- */}
      {palette.length ? (
        <section aria-label="Palette" className="flex min-h-40 overflow-hidden rounded-card break-inside-avoid max-md:flex-col">
          {palette.map((color, index) => (
            <div
              key={`${color.name}-${index}`}
              className={`grid min-w-0 content-end gap-1 p-4 md:p-6 ${color.hex ? "" : "hatch bg-soft text-mute"}`}
              style={{ flexGrow: SWATCH_WEIGHTS[index] ?? 1, flexBasis: 0, ...(color.hex ? { backgroundColor: color.hex, color: onBrand(color.hex) } : {}) } as CSSProperties}
            >
              <span className="truncate text-title first-letter:uppercase">{color.name}</span>
              <span className="font-mono text-meta opacity-80">{color.hex ?? "code à préciser"}</span>
            </div>
          ))}
        </section>
      ) : null}

      {/* ---- Le mur : la marque telle qu'elle sort vraiment. La composition suit le nombre d'images. ---- */}
      {board.wall.length >= 4 ? (
        <section aria-label="Créations gardées" className="grid grid-cols-2 gap-4 break-inside-avoid md:grid-cols-4">
          <WallImage image={hero} className="col-span-2 row-span-2 aspect-square" eager />
          {rest.slice(0, 4).map((image) => (
            <WallImage key={image.src} image={image} className="aspect-square" />
          ))}
        </section>
      ) : board.wall.length > 1 ? (
        <section aria-label="Créations gardées" className={`grid gap-4 break-inside-avoid ${board.wall.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {board.wall.map((image, index) => (
            <WallImage key={image.src} image={image} className="aspect-square" eager={index === 0} />
          ))}
        </section>
      ) : hero ? (
        <section aria-label="Création gardée" className="break-inside-avoid">
          <WallImage image={hero} className="aspect-video md:aspect-[21/9]" eager />
        </section>
      ) : null}

      {/* ---- Positionnement et cible ---- */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Section title="Positionnement" review="Je veux revoir le positionnement de la marque." editable={editable} className="lg:col-span-7">
          <p className="font-display text-h1 text-ink">{canon.positioning}</p>
        </Section>
        <Section title="À qui elle parle" review="Je veux revoir la cible de la marque." editable={editable} className="lg:col-span-5">
          <span className="grid size-12 place-items-center rounded-pill bg-tint text-ink">
            <Users size={18} strokeWidth={1.75} />
          </span>
          <p className="text-body text-ink">{canon.audience}</p>
        </Section>
      </div>

      {/* ---- L'entreprise et ses publics (questionnaire d'onboarding) ---- */}
      {canon.business?.offer || canon.audiences?.length ? (
        <div className="grid gap-4 lg:grid-cols-12">
          {canon.business?.offer ? (
            <Section title="Ce qu’elle vend" review="Je veux revoir l’offre, les bénéfices et l’objectif de la marque." editable={editable} className="lg:col-span-5">
              <p className="font-display text-h2 font-normal text-ink">{canon.business.offer}</p>
              {canon.business.benefits.length ? (
                <ul className="grid gap-2">
                  {canon.business.benefits.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-3 text-body text-ink">
                      <span className="mt-2 size-1.5 flex-none rounded-pill bg-brand" />
                      <span className="first-letter:uppercase">{benefit}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <dl className="grid gap-2 border-t border-line pt-4 font-mono text-meta text-mute">
                {canon.business.sector ? <div><dt className="inline">Secteur · </dt><dd className="inline text-ink">{canon.business.sector}</dd></div> : null}
                {canon.business.area ? <div><dt className="inline">Zone · </dt><dd className="inline text-ink">{canon.business.area}</dd></div> : null}
                {canon.business.objective ? <div><dt className="inline">Objectif 90 jours · </dt><dd className="inline text-ink">{canon.business.objective}</dd></div> : null}
                {canon.business.alternative ? <div><dt className="inline">Sinon, le client · </dt><dd className="inline text-ink">{canon.business.alternative}</dd></div> : null}
              </dl>
            </Section>
          ) : null}
          {canon.audiences?.length ? (
            <Section title="Ses publics" review="Je veux revoir les publics de la marque : qui, désir, objection, preuve." editable={editable} className={canon.business?.offer ? "lg:col-span-7" : "lg:col-span-12"}>
              <ol className={`grid gap-4 ${canon.audiences.length > 1 ? "md:grid-cols-2" : ""}`}>
                {canon.audiences.map((audience, index) => (
                  <li key={audience.who} className="grid content-start gap-2 rounded-inner bg-soft p-4">
                    <span className="font-mono text-meta text-mute">{index === 0 ? "Public principal" : `Public ${index + 1}`}</span>
                    <span className="font-display text-h2 font-normal text-ink">{audience.who}</span>
                    {audience.desire ? <span className="text-small text-ink"><span className="text-mute">Veut · </span>{audience.desire}</span> : null}
                    {audience.objection ? <span className="text-small text-ink"><span className="text-mute">Hésite · </span>{audience.objection}</span> : null}
                    {audience.proof ? <span className="text-small text-ink"><span className="text-mute">Convaincu par · </span>{audience.proof}</span> : null}
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}
        </div>
      ) : null}

      {/* ---- Voix : là où le client se reconnaît ---- */}
      {canon.voice?.says.length || canon.voice?.never.length || editable ? (
        <Section title="Sa voix" review="Je veux revoir la voix de la marque : ce qu’elle dirait, ce qu’elle ne dirait jamais." editable={editable}>
          {canon.voice?.says.length || canon.voice?.never.length ? (
            <div className="grid gap-8 md:grid-cols-2">
              <div className="grid content-start gap-4">
                <p className="font-mono text-meta text-success">Elle dirait</p>
                {canon.voice.says.map((line) => (
                  <p key={line} className="font-display text-h2 font-normal text-ink">« {line} »</p>
                ))}
              </div>
              <div className="grid content-start gap-4">
                <p className="font-mono text-meta text-danger">Jamais</p>
                {canon.voice.never.map((line) => (
                  <p key={line} className="font-display text-h2 font-normal text-mute line-through decoration-line">« {line} »</p>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-small text-mute print:hidden">
              Pas encore d’exemples de voix pour cette marque. Relancez l’analyse (dans les coulisses, en bas de page) ou demandez-les à l’expert.
            </p>
          )}
          {canon.voice?.must?.length || canon.voice?.forbidden?.length || canon.voice?.address || canon.voice?.sliders ? (
            <div className="grid gap-4 border-t border-line pt-4 md:grid-cols-2">
              <div className="grid content-start gap-3">
                {canon.voice.address ? <p className="font-mono text-meta text-mute">{canon.voice.address === "tu" ? "Elle tutoie" : "Elle vouvoie"}</p> : null}
                {canon.voice.must?.length ? (
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-meta text-success">Ses mots</span>
                    {canon.voice.must.map((word) => <span key={word} className="rounded-pill bg-success-tint px-3 py-1 text-small text-success">{word}</span>)}
                  </p>
                ) : null}
                {canon.voice.forbidden?.length ? (
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-meta text-danger">Interdits</span>
                    {canon.voice.forbidden.map((word) => <span key={word} className="rounded-pill bg-danger-tint px-3 py-1 text-small text-danger line-through">{word}</span>)}
                  </p>
                ) : null}
              </div>
              {canon.voice.sliders ? (
                <dl className="grid content-start gap-2">
                  {SLIDERS.map(({ key, left, right }) => (
                    <div key={key} className="grid grid-cols-[6rem_minmax(0,1fr)_6rem] items-center gap-2 font-mono text-meta text-mute">
                      <dt className="truncate">{left}</dt>
                      <dd className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <span key={n} className={`h-1.5 flex-1 rounded-pill ${n === canon.voice!.sliders![key] ? "bg-ink" : "bg-line"}`} />
                        ))}
                      </dd>
                      <dt className="truncate text-right">{right}</dt>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          ) : null}
        </Section>
      ) : null}

      {/* ---- Offres, preuves, où elle parle ---- */}
      {canon.offers?.items.length || canon.offers?.proofs.length || canon.presence?.push.length || canon.presence?.formats.length ? (
        <div className="grid gap-4 lg:grid-cols-12">
          {canon.offers?.items.length || canon.offers?.proofs.length || canon.offers?.legal.length ? (
            <Section title="Offres et preuves" review="Je veux revoir les offres phares, les preuves et les contraintes légales de la marque." editable={editable} className="lg:col-span-7">
              {canon.offers.items.length ? (
                <ul className="grid gap-3">
                  {canon.offers.items.map((item) => (
                    <li key={item.name} className="grid gap-0.5 border-t border-line pt-3">
                      <span className="text-title text-ink">{item.name}</span>
                      {item.line ? <span className="text-small text-mute">{item.line}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {canon.offers.proofs.length ? (
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-meta text-mute">Preuves</span>
                  {canon.offers.proofs.map((proof) => <span key={proof} className="rounded-pill bg-tint px-3 py-1 text-small text-ink">{proof}</span>)}
                </p>
              ) : null}
              {canon.offers.legal.length ? <p className="font-mono text-meta text-warning">Mentions · {canon.offers.legal.join(" · ")}</p> : null}
              {canon.offers.showPrices ? <p className="font-mono text-meta text-mute">Prix affichés publiquement · {canon.offers.showPrices}</p> : null}
            </Section>
          ) : null}
          {canon.presence?.push.length || canon.presence?.formats.length || canon.presence?.active.length ? (
            <Section title="Où elle parle" review="Je veux revoir les canaux et les formats prioritaires de la marque." editable={editable} className={canon.offers?.items.length || canon.offers?.proofs.length ? "lg:col-span-5" : "lg:col-span-12"}>
              {canon.presence.push.length ? (
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-meta text-mute">À pousser</span>
                  {canon.presence.push.map((c) => <span key={c} className="rounded-pill bg-ink px-3 py-1 text-small text-card">{CHANNELS[c as keyof typeof CHANNELS] ?? c}</span>)}
                </p>
              ) : null}
              {canon.presence.active.length ? (
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-meta text-mute">Actifs</span>
                  {canon.presence.active.map((c) => <span key={c} className="rounded-pill bg-soft px-3 py-1 text-small text-ink">{CHANNELS[c as keyof typeof CHANNELS] ?? c}</span>)}
                </p>
              ) : null}
              {canon.presence.formats.length ? <p className="text-small text-ink"><span className="font-mono text-meta text-mute">Formats · </span>{canon.presence.formats.join(", ")}</p> : null}
              {canon.presence.frequency ? <p className="font-mono text-meta text-mute">Rythme perçu · {FREQUENCIES[canon.presence.frequency]}</p> : null}
            </Section>
          ) : null}
        </div>
      ) : null}

      {/* ---- Piliers ---- */}
      {canon.pillars.length ? (
        <Section title="Ce dont elle parle" review="Je veux revoir les piliers éditoriaux de la marque." editable={editable}>
          <ol className="grid gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
            {canon.pillars.map((pillar, index) => {
              const { title, line } = parsePillar(pillar);
              return (
                <li key={pillar} className="grid content-start gap-2 border-t border-line pt-4">
                  <span className="font-mono text-meta text-mute">{String(index + 1).padStart(2, "0")}</span>
                  <span className="font-display text-h2 font-normal text-ink">{title}</span>
                  {line ? <span className="text-small text-mute first-letter:uppercase">{line}</span> : null}
                </li>
              );
            })}
          </ol>
        </Section>
      ) : null}

      {/* ---- Direction visuelle ---- */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Section title="À quoi elle ressemble" review="Je veux revoir la direction visuelle de la marque." editable={editable} className="lg:col-span-7">
          <p className="font-display text-h2 font-normal text-ink">{canon.visual.style}</p>
          <p className="text-body text-mute">{canon.visual.mood}</p>
        </Section>
        <Section title="Ce qu’on ne verra jamais" editable={editable} className="lg:col-span-5">
          <ul className="grid gap-3">
            {[...canon.visual.avoid, ...(canon.identity?.nonNegotiables ?? []), ...(canon.identity?.dated ?? [])].map((item) => (
              <li key={item} className="flex items-start gap-3 text-body text-ink">
                <span className="mt-1 grid size-5 flex-none place-items-center rounded-pill bg-danger-tint text-danger"><X size={12} strokeWidth={2} /></span>
                <span className="first-letter:uppercase">{item}</span>
              </li>
            ))}
          </ul>
          {canon.identity?.fonts.display || canon.identity?.fonts.body ? (
            <p className="border-t border-line pt-4 font-mono text-meta text-mute">
              Polices · {[canon.identity.fonts.display, canon.identity.fonts.body].filter(Boolean).join(" / ")}
            </p>
          ) : null}
        </Section>
      </div>

      {/* ---- Le système graphique des tuiles avec texte ---- */}
      {canon.graphic ? (
        <Section title="Le système des tuiles" review="Je veux revoir le système graphique des posts avec texte : fonds, polices, forme signature, stickers, titres, logo." editable={editable}>
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="grid gap-3">
              <span className="font-mono text-meta text-mute">Trois fonds qui alternent</span>
              <div className="flex overflow-hidden rounded-inner">
                {(["brand", "light", "dark"] as const).map((key) => {
                  const hex = canon.graphic!.backgrounds[key].match(/#[0-9a-f]{6}\b/i)?.[0];
                  return (
                    <div key={key} className={`grid min-h-24 flex-1 content-end p-3 ${hex ? "" : "hatch bg-soft"}`} style={hex ? ({ backgroundColor: hex, color: onBrand(hex) } as CSSProperties) : undefined}>
                      <span className="text-small font-semibold">{key === "brand" ? "Marque" : key === "light" ? "Clair" : "Sombre"}</span>
                      <span className="font-mono text-meta opacity-80">{hex ?? "code à préciser"}</span>
                    </div>
                  );
                })}
              </div>
              {canon.graphic.fonts.display || canon.graphic.fonts.body ? (
                <p className="font-mono text-meta text-mute">Polices · {[canon.graphic.fonts.display, canon.graphic.fonts.body].filter(Boolean).join(" / ")}</p>
              ) : null}
            </div>
            <dl className="grid content-start gap-3">
              {(
                [
                  ["Forme signature", canon.graphic.shape],
                  ["Stickers et accents", canon.graphic.stickers],
                  ["Titres", canon.graphic.titles],
                  ["Logo", canon.graphic.logoRule],
                ] as const
              ).map(([term, value]) =>
                value ? (
                  <div key={term} className="grid gap-0.5 border-t border-line pt-3">
                    <dt className="font-mono text-meta text-mute">{term}</dt>
                    <dd className="text-small text-ink">{value}</dd>
                  </div>
                ) : null
              )}
            </dl>
          </div>
        </Section>
      ) : editable ? (
        <Section title="Le système des tuiles" review="Posons le système graphique des posts avec texte de cette marque : trois fonds (marque, clair, sombre), deux polices Google Fonts, une forme signature, un style de stickers, le traitement des titres, la règle du logo." editable={editable}>
          <p className="text-small text-mute print:hidden">Pas encore posé : les tuiles avec texte utilisent la palette et des réglages sobres. Demandez-le à l’expert, ou relancez l’analyse.</p>
        </Section>
      ) : null}

      {/* ---- Les assets de base d'une identité créée par Brand OS ---- */}
      {board.assets?.length ? (
        <Section title="Les assets de base" editable={editable}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {board.assets.map((asset) => (
              <a key={asset.url} href={asset.url} target="_blank" rel="noreferrer" className="grid gap-1">
                <span className="relative block aspect-square overflow-hidden rounded-inner bg-soft">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.url} alt={asset.label} loading="lazy" className={`absolute inset-0 size-full ${asset.kind === "mood" ? "object-cover" : "object-contain p-2"}`} />
                </span>
                <span className="font-mono text-meta text-mute">{asset.label}</span>
              </a>
            ))}
          </div>
          {board.identityDirection ? <Meta>Direction choisie : {board.identityDirection}. Les logos sont des images (PNG), pas des vecteurs.</Meta> : null}
        </Section>
      ) : null}

      {/* ---- Stratégie ---- */}
      {canon.strategy || editable ? (
        <Section title="Stratégie" review="Posons la stratégie de cette marque : objectifs, canaux, angles, rythme." editable={editable}>
          {canon.strategy ? (
            <dl className="grid gap-x-8 gap-y-6 md:grid-cols-2">
              {(
                [
                  ["Objectifs", canon.strategy.objectives],
                  ["Canaux", canon.strategy.channels],
                  ["Angles", canon.strategy.angles],
                ] as const
              ).map(([term, items]) =>
                items.length ? (
                  <div key={term} className="grid content-start gap-2 border-t border-line pt-4">
                    <dt className="font-mono text-meta text-mute">{term}</dt>
                    <dd className="flex flex-wrap gap-2">
                      {items.map((item) => (
                        <span key={item} className="rounded-pill bg-tint px-3 py-1 text-small text-ink">{item}</span>
                      ))}
                    </dd>
                  </div>
                ) : null
              )}
              {canon.strategy.rhythm ? (
                <div className="grid content-start gap-2 border-t border-line pt-4">
                  <dt className="font-mono text-meta text-mute">Rythme</dt>
                  <dd className="text-body text-ink">{canon.strategy.rhythm}</dd>
                  {validCadence(canon.strategy.cadence).length ? (
                    <dd className="flex flex-wrap gap-2">
                      {validCadence(canon.strategy.cadence).map((c) => (
                        <span key={c.channel} className="rounded-pill bg-tint px-3 py-1 text-small text-ink">
                          {CHANNELS[c.channel]} <span className="font-mono text-meta text-mute">· {c.perWeek} / semaine</span>
                        </span>
                      ))}
                    </dd>
                  ) : null}
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="text-small text-mute print:hidden">Pas encore posée. Elle se décide en discutant avec l’expert : objectifs, canaux, angles, rythme.</p>
          )}
        </Section>
      ) : null}
    </article>
  );
}
