import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, ArchiveRestore, CalendarPlus, Clock, Download, ImageOff, MessageSquareText, Pin, Shirt, TriangleAlert, Wand2, X } from "lucide-react";
import { formatLabel } from "@/components/app/OutTile";
import { AssetUploader } from "@/components/studio/AssetUploader";
import { FormatPicker } from "@/components/studio/FormatPicker";
import { SeriesComposer } from "@/components/studio/SeriesComposer";
import { FeedView } from "@/components/studio/FeedView";
import { BrandCard, ButtonLink, Card, CardHeader, Empty, Field, Input, Meta, Notice, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ASSET_KINDS, listAssets } from "@/lib/assets";
import { ASPECT_RATIOS, FORMAT_FAMILIES, IMAGE_FORMATS, OFFERED_FORMATS } from "@/lib/brand-os";
import { PROPOSALS_PER_BRIEF } from "@/lib/jobs/engine";
import { isStagedCreation, outImageUrl, type OutPayload, type OutStatus } from "@/lib/outs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BACKGROUND_LABEL, TILE_KINDS, type Background } from "@/lib/tiles/model";
import { getWorkspace, isValidated } from "@/lib/workspace";
import { ValidationGate } from "@/components/app/ValidationGate";
import { createProposals, removeAsset, retouch, setStatus } from "./actions";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const MODE_LABEL = { describe: "D’après un brief", restage: "D’après une photo de la photothèque", retouch: "Retouche d’une création" } as const;

const VIEWS = {
  actives: { label: "En cours", statuses: ["draft", "ready"] },
  gardees: { label: "Gardées", statuses: ["ready"] },
  brouillons: { label: "Brouillons", statuses: ["draft"] },
  archives: { label: "Archives", statuses: ["archived"] },
} as const satisfies Record<string, { label: string; statuses: readonly OutStatus[] }>;
type View = keyof typeof VIEWS;

const TAB = "whitespace-nowrap rounded-pill px-4 py-2 text-small text-mute transition duration-(--duration-fast) ease-cimaise hover:text-ink aria-[current=page]:bg-ink aria-[current=page]:text-card";

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; focus?: string; lot?: string; brief?: string; ref?: string; echec?: string }>;
}) {
  const { brand, os, mega } = await getWorkspace();
  if (!brand) redirect("/app/clients");
  if (!isValidated(brand)) return <ValidationGate brandName={brand.name} feature="Le Studio" />;
  const { vue, focus, lot, brief: suggestedBrief, ref, echec } = await searchParams;
  // Why the lot came back short: said plainly, because a thinner wall says nothing (seen live: an empty image account).
  const failureLine = echec === "credits" ? " Cause : le compte du service d’images n’a plus de crédit. Rechargez-le, puis « Recréer »." : echec === "service" ? " Cause : le service d’images a refusé ou n’a pas répondu à temps. Réessayez dans un instant." : "";
  const library = vue === "phototheque";
  const feedView = vue === "feed";
  const view: View = vue && vue in VIEWS ? (vue as View) : "actives";

  const supabase = await createSupabaseServerClient();
  const [assets, { data: outs }] = await Promise.all([
    listAssets(brand.id),
    supabase.from("outs").select("id,status,created_at,payload").eq("brand_id", brand.id).in("status", [...VIEWS[view].statuses]).order("created_at", { ascending: false }),
  ]);
  const back = `/app/studio?vue=${view}`;

  // "Mettre en situation": a creation (a T-shirt artwork…) becomes the reference of the next ones.
  const { data: refOut } =
    ref && /^[0-9a-f-]{36}$/i.test(ref)
      ? await supabase.from("outs").select("id,payload").eq("id", ref).eq("brand_id", brand.id).maybeSingle()
      : { data: null };
  const refPayload = (refOut?.payload ?? null) as OutPayload | null;
  const refSrc = outImageUrl(refPayload);
  // The brand's logo, if any: tiles with text get it as a reference so the model reproduces the real one.
  const { data: brandRow } = await supabase.from("brands").select("data").eq("id", brand.id).maybeSingle();
  const brandData = (brandRow?.data ?? {}) as { logo?: { url?: string }; site?: { logo?: string | null } };
  const logoUrl = brandData.logo?.url ?? brandData.site?.logo ?? null;
  // A series (feed, carousel) reads in its planned order, not in the order the images came back.
  const position = (out: { payload: unknown }) => {
    const p = out.payload as OutPayload | null;
    return p?.carousel?.index ?? (p?.feed_index != null ? p.feed_index + 1 : null);
  };
  (outs ?? []).sort((a, b) => {
    const aIn = lot && (a.payload as OutPayload | null)?.batch_id === lot;
    const bIn = lot && (b.payload as OutPayload | null)?.batch_id === lot;
    if (aIn && bIn) return (position(a) ?? 0) - (position(b) ?? 0);
    if (aIn !== bIn) return aIn ? -1 : 1;
    return 0;
  });
  const fresh = (outs ?? []).filter((out) => lot && (out.payload as OutPayload | null)?.batch_id === lot);
  const failed = lot && fresh.length && fresh.length < PROPOSALS_PER_BRIEF ? PROPOSALS_PER_BRIEF - fresh.length : 0;
  const rules = mega?.rules.length ?? 0;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Meta>Studio · {brand.name}</Meta>
          <h1 className="mt-2 font-display text-display text-ink">{library ? "La photothèque" : feedView ? "Le feed" : "Le mur"}</h1>
        </div>
        <nav aria-label="Vues du Studio" className="flex gap-1 overflow-x-auto rounded-pill bg-card p-1">
          {(Object.keys(VIEWS) as View[]).map((key) => (
            <Link key={key} href={`/app/studio?vue=${key}`} aria-current={!library && !feedView && key === view ? "page" : undefined} className={TAB}>
              {VIEWS[key].label}
            </Link>
          ))}
          <Link href="/app/studio?vue=feed" aria-current={feedView ? "page" : undefined} className={TAB}>
            Feed
          </Link>
          <Link href="/app/studio?vue=phototheque" aria-current={library ? "page" : undefined} className={TAB}>
            Photothèque{assets?.length ? ` · ${assets.length}` : ""}
          </Link>
        </nav>
      </header>

      {feedView ? (
        <FeedView outs={(outs ?? []) as { id: string; status: string; created_at: string; payload: OutPayload | null }[]} lot={lot ?? null} brandName={brand.name} />
      ) : library ? (
        <>
          <BrandCard>
            <div className="grid gap-2">
              <span className="font-mono text-meta opacity-80">Les vrais produits de {brand.name}</span>
              <p className="max-w-[44ch] font-display text-h1">Un visuel de marque montre ce que la marque vend vraiment.</p>
              <p className="max-w-prose text-small opacity-80">
                Déposez ici les photos des produits, des lieux, de l’équipe. Au moment de créer, choisissez-en une : le modèle garde le
                sujet à l’identique et compose une nouvelle scène autour, dans la direction visuelle de la marque.
              </p>
            </div>
          </BrandCard>

          {assets === null ? (
            <Notice tone="warning">
              La photothèque attend une mise à jour de la base : exécutez <code className="font-mono text-meta">supabase/migrations/0007_brand_assets.sql</code> dans Supabase → SQL Editor.
            </Notice>
          ) : (
            <>
              <Card>
                <CardHeader title="Ajouter une photo" aside={<Meta>JPG, PNG ou WebP · 10 Mo max</Meta>} />
                <AssetUploader brandId={brand.id} kinds={ASSET_KINDS} />
              </Card>
              {assets.length ? (
                <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                  {assets.map((asset) => (
                    <li key={asset.id}>
                      <Card className="grid grid-cols-[minmax(0,1fr)] gap-3 p-4">
                        <div className="relative aspect-square overflow-hidden rounded-inner bg-tint">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={asset.url} alt={asset.label} loading="lazy" className="absolute inset-0 size-full object-cover" />
                        </div>
                        <div className="grid gap-1">
                          <span className="truncate text-small font-semibold text-ink">{asset.label}</span>
                          <Meta>{ASSET_KINDS[asset.kind]}</Meta>
                        </div>
                        <form action={removeAsset}>
                          <input type="hidden" name="assetId" value={asset.id} />
                          <SubmitButton variant="ghost" pendingLabel="…" className="px-0">
                            <Archive size={16} strokeWidth={1.75} /> Retirer
                          </SubmitButton>
                        </form>
                      </Card>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty title="Aucune photo pour l’instant">Commencez par les trois produits que ce client met le plus en avant.</Empty>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {/* ---- Créer : dans le mur, pas sur une autre page ---- */}
          <div className="grid gap-4 lg:grid-cols-12">
            <Card className="lg:col-span-8">
              <form action={createProposals} className="grid gap-6">
                <Field label="Que voulez-vous voir ?" hint="Une scène, un objet, une situation. Sans brief, Brand OS illustre la promesse de la marque.">
                  <Textarea name="brief" rows={3} maxLength={800} defaultValue={suggestedBrief?.slice(0, 800) ?? ""} placeholder="Un bol fumant sur une table en bois, lumière du matin…" />
                </Field>

                {refOut && refSrc ? (
                  <div className="flex items-center gap-3 rounded-inner bg-tint p-2 pr-3">
                    <input type="hidden" name="refOutId" value={refOut.id as string} />
                    <span className="relative block size-14 flex-none overflow-hidden rounded-inner bg-soft">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={refSrc} alt="" className="absolute inset-0 size-full object-cover" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-meta text-mute">Mise en situation de cette création</span>
                      <span className="block truncate text-small text-ink">Choisissez le support (Textile → « porté », Signalétique, packaging…) : le visuel y est reproduit tel quel.</span>
                    </span>
                    <Link href="/app/studio" aria-label="Ne plus partir de cette création" className="grid size-8 flex-none place-items-center rounded-pill text-mute transition duration-(--duration-fast) ease-cimaise hover:bg-card hover:text-ink">
                      <X size={16} strokeWidth={1.75} />
                    </Link>
                  </div>
                ) : null}

                <FormatPicker
                  formats={OFFERED_FORMATS.map((key) => {
                    const { label, hint, family, aspectRatio, resolution, nature } = IMAGE_FORMATS[key];
                    return { key, label, hint, family, aspectRatio, resolution, nature: nature ?? "photo" };
                  })}
                  families={FORMAT_FAMILIES}
                  ratios={ASPECT_RATIOS}
                  tileKinds={TILE_KINDS}
                  hasLogo={Boolean(logoUrl)}
                  defaultFormat={refOut ? "tshirt_mockup" : "social_square"}
                />

                <fieldset className="grid gap-2">
                  <legend className="mb-2 text-small font-semibold text-ink">Partir d’un vrai produit</legend>
                  {assets?.length ? (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      <label className="flex-none cursor-pointer">
                        <input type="radio" name="assetId" value="" defaultChecked className="peer sr-only" />
                        <span className="grid size-20 place-items-center rounded-inner bg-soft text-mute transition duration-(--duration-fast) ease-cimaise peer-checked:outline-2 peer-checked:outline-offset-2 peer-checked:outline-ink">
                          <ImageOff size={18} strokeWidth={1.75} />
                        </span>
                        <span className="mt-1 block w-20 truncate text-center font-mono text-meta text-mute">Aucun</span>
                      </label>
                      {assets.map((asset) => (
                        <label key={asset.id} className="flex-none cursor-pointer" title={asset.label}>
                          <input type="radio" name="assetId" value={asset.id} className="peer sr-only" />
                          <span className="relative block size-20 overflow-hidden rounded-inner bg-tint transition duration-(--duration-fast) ease-cimaise peer-checked:outline-2 peer-checked:outline-offset-2 peer-checked:outline-ink">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={asset.url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                          </span>
                          <span className="mt-1 block w-20 truncate text-center font-mono text-meta text-mute">{asset.label}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-small text-mute">
                      La photothèque est vide : sans photo, les produits montrés sont inventés par le modèle.{" "}
                      <Link href="/app/studio?vue=phototheque" className="font-semibold text-ink underline underline-offset-4">Ajouter les produits du client</Link>
                    </p>
                  )}
                </fieldset>

                <SubmitButton pendingLabel={`Création de ${PROPOSALS_PER_BRIEF} propositions… (≈ 30 s)`} className="justify-self-start">
                  Créer {PROPOSALS_PER_BRIEF} propositions
                </SubmitButton>
              </form>
            </Card>

            <BrandCard className="lg:col-span-4">
              <div className="grid gap-4">
                <span className="font-mono text-meta opacity-80">Ce que Brand OS ajoute à votre brief</span>
                <p className="font-display text-h2 font-normal">
                  {os?.canon ? `${os.canon.visual.style}` : "La direction visuelle de cette marque n’est pas encore définie."}
                </p>
                {os?.canon?.visual.mood ? <p className="text-small opacity-80">{os.canon.visual.mood}</p> : null}
                <p className="text-small opacity-80">
                  {rules ? `+ ${rules} règle${rules > 1 ? "s" : ""} apprise${rules > 1 ? "s" : ""} avec l’expert` : "Aucune règle apprise pour l’instant."}
                </p>
              </div>
            </BrandCard>
          </div>

          <Card>
            <CardHeader title="Composer une série" aside={<Meta>feed de 9 · carrousel</Meta>} />
            <SeriesComposer hasLogo={Boolean(logoUrl)} />
          </Card>

          {lot && fresh.length ? (
            <Notice tone={failed > 0 ? "warning" : "success"}>
              {fresh.length} proposition{fresh.length > 1 ? "s" : ""} en tête du mur, encadrée{fresh.length > 1 ? "s" : ""}.
              {failed > 0 ? ` ${failed} n’${failed > 1 ? "ont" : "a"} pas abouti.${failureLine}` : ""} Gardez celles qui vous plaisent, retouchez, ou archivez.
            </Notice>
          ) : lot ? (
            <Notice tone="danger">Aucune proposition n’a abouti.{failureLine || " Réessayez ; si cela persiste, le service d’images est peut-être indisponible."}</Notice>
          ) : null}

          {/* ---- Le mur ---- */}
          {outs?.length ? (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {outs.map((out) => {
                const payload = out.payload as OutPayload | null;
                const src = outImageUrl(payload);
                const status = out.status as OutStatus;
                const format = formatLabel(payload);
                const highlighted = focus === out.id || (lot && payload?.batch_id === lot);
                return (
                  <li key={out.id} id={out.id}>
                    <Card className={`grid grid-cols-[minmax(0,1fr)] gap-4 p-4 ${highlighted ? "outline-2 outline-offset-2 outline-ink" : ""}`}>
                      <div className="relative aspect-square overflow-hidden rounded-inner bg-tint">
                        {src ? (
                          // Generated images live on Storage or the generator's CDN: plain <img>.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={src} alt={payload?.brief || "Création"} loading="lazy" className="absolute inset-0 size-full object-contain" />
                        ) : null}
                        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-pill bg-card px-2 py-1 font-mono text-meta text-ink">
                          {status === "ready" ? <Pin size={12} strokeWidth={1.75} /> : status === "archived" ? <Archive size={12} strokeWidth={1.75} /> : <Clock size={12} strokeWidth={1.75} />}
                          {status === "ready" ? "Gardée" : status === "archived" ? "Archivée" : "Brouillon"}
                        </span>
                        {payload?.text_check && !payload.text_check.ok ? (
                          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-pill bg-warning-tint px-2 py-1 font-mono text-meta text-warning" title={`Attendu : ${payload.text_check.issues.join(" · ")}`}>
                            <TriangleAlert size={12} strokeWidth={1.75} /> Texte à vérifier
                          </span>
                        ) : null}
                      </div>

                      <div className="grid gap-1">
                        <p className="line-clamp-2 text-small text-ink">{payload?.tile ? payload.tile.copy.headline : payload?.instruction ? `Retouche : ${payload.instruction}` : payload?.brief || "Sans brief"}</p>
                        <Meta>
                          {format}
                          {payload?.carousel ? ` · diapo ${payload.carousel.index}/${payload.carousel.total}` : payload?.feed_index != null ? ` · feed, tuile ${payload.feed_index + 1}` : ""}
                          {payload?.tile ? ` · ${TILE_KINDS[payload.tile.kind as keyof typeof TILE_KINDS]?.label ?? "tuile"} · ${BACKGROUND_LABEL[payload.tile.background as Background] ?? payload.tile.background}` : ""} · {DATE.format(new Date(out.created_at))}
                        </Meta>
                        {payload?.text_check && !payload.text_check.ok ? (
                          <p className="text-small text-warning">
                            Le modèle n’a pas écrit exactement : {payload.text_check.issues.map((t) => `« ${t} »`).join(", ")}. Il a écrit : {payload.text_check.found.map((t) => `« ${t} »`).join(" ")}. Retouchez, ou relancez.
                          </p>
                        ) : null}
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
                        {status === "ready" ? (
                          <ButtonLink href={`/app/calendrier?creation=${out.id}`} variant="soft">
                            <CalendarPlus size={16} strokeWidth={1.75} /> Planifier
                          </ButtonLink>
                        ) : null}
                        {src ? (
                          <a href={`/api/outs/${out.id}/download`} className="inline-flex items-center justify-center gap-2 rounded-pill bg-soft px-4 py-2 text-small font-semibold text-ink transition duration-(--duration-fast) ease-cimaise hover:bg-line">
                            <Download size={16} strokeWidth={1.75} /> Télécharger
                          </a>
                        ) : null}
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

                      {/* Two gestures, kept apart: fix THIS picture, or fix the BRAND. */}
                      {src && status !== "archived" ? (
                        <div className="grid gap-3 border-t border-line pt-3">
                          <details>
                            <summary className="flex cursor-pointer list-none items-center gap-2 text-small font-semibold text-ink">
                              <Wand2 size={16} strokeWidth={1.75} /> Retoucher cette image
                            </summary>
                            <form action={retouch} className="mt-3 grid gap-2">
                              <input type="hidden" name="outId" value={out.id} />
                              <Input name="instruction" required maxLength={300} placeholder="« plus de vapeur », « cadre plus serré »…" className="py-2" />
                              <Meta>Seul ce changement est appliqué ; la marque n’est pas modifiée.</Meta>
                              <SubmitButton variant="soft" pendingLabel="Retouche… (≈ 30 s)" className="justify-self-start">Retoucher</SubmitButton>
                            </form>
                          </details>
                          <Link href={`/app/studio?ref=${out.id}`} className="flex items-center gap-2 text-small font-semibold text-ink transition duration-(--duration-fast) ease-cimaise hover:text-mute">
                            <Shirt size={16} strokeWidth={1.75} /> Mettre en situation (tee-shirt, sac, vitrine…)
                          </Link>
                          <Link href={`/app/expert?image=${out.id}`} className="flex items-center gap-2 text-small font-semibold text-ink transition duration-(--duration-fast) ease-cimaise hover:text-mute">
                            <MessageSquareText size={16} strokeWidth={1.75} /> C’est un problème de marque : en parler à l’expert
                          </Link>
                        </div>
                      ) : null}

                      <details className="border-t border-line pt-3">
                        <summary className="cursor-pointer list-none font-mono text-meta text-mute">D’où vient cette image</summary>
                        <dl className="mt-3 grid gap-2">
                          <div>
                            <dt><Meta>Origine</Meta></dt>
                            <dd className="text-small text-ink">
                              {isStagedCreation(payload)
                                ? "Mise en situation d’une création du mur"
                                : `${MODE_LABEL[payload?.mode ?? "describe"]}${payload?.subject ? ` (« ${payload.subject} »)` : ""}`}
                            </dd>
                          </div>
                          {payload?.tile ? (
                            <div>
                              <dt><Meta>Texte demandé</Meta></dt>
                              <dd className="text-small text-ink">
                                {[payload.tile.copy.headline, payload.tile.copy.subline, payload.tile.copy.caption, payload.tile.copy.cta, ...(payload.tile.copy.items ?? [])].filter(Boolean).map((t) => `« ${t} »`).join(" · ")}
                                {payload.text_check ? (payload.text_check.ok ? " — relu sur l’image : conforme." : " — relu sur l’image : écart signalé.") : " — relecture indisponible."}
                                {payload.tile.logo ? " Logo de la marque posé en référence." : ""}
                              </dd>
                            </div>
                          ) : null}
                          <div>
                            <dt><Meta>Ce qui a été envoyé au modèle d’image</Meta></dt>
                            <dd className="text-small text-mute">{payload?.prompt || "Non enregistré."}</dd>
                          </div>
                        </dl>
                      </details>
                    </Card>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty title={view === "actives" ? "Rien d’épinglé pour l’instant" : `Aucune création dans « ${VIEWS[view].label} »`}>
              {view === "actives" ? `Décrivez une scène ci-dessus : ${PROPOSALS_PER_BRIEF} propositions arriveront ici.` : "Changez de vue pour voir les autres créations."}
            </Empty>
          )}
        </>
      )}
    </>
  );
}
