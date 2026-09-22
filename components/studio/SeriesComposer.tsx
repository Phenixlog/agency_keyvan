"use client";

import { useState } from "react";
import { Grid3x3, GalleryHorizontal, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { createSeries } from "@/app/(app)/app/studio/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { BACKGROUND_LABEL, CAROUSEL_MAX, CAROUSEL_MIN, FEED_SIZE, TILE_KINDS, carouselSlideKind, type Background, type PlannedTile, type TilePlan } from "@/lib/tiles/model";

type Series = "feed" | "carousel";
const FIELD = "w-full rounded-inner bg-card px-3 py-2 text-body text-ink placeholder:text-mute focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const TAB = "inline-flex items-center gap-2 whitespace-nowrap rounded-pill px-3 py-2 text-small text-mute transition duration-(--duration-fast) ease-cimaise hover:text-ink aria-pressed:bg-ink aria-pressed:text-card";
const FORMATS: Record<Series, { key: string; label: string }[]> = {
  feed: [
    { key: "social_square", label: "Carré 1:1" },
    { key: "social_portrait", label: "Portrait 4:5" },
  ],
  carousel: [
    { key: "social_portrait", label: "Portrait 4:5" },
    { key: "social_square", label: "Carré 1:1" },
  ],
};

/**
 * A feed of nine, or a carousel: planned by the model, reviewed here (texts editable), then drawn
 * all at once. The plan travels as JSON and is re-validated server-side before anything is paid for.
 */
export function SeriesComposer({ hasLogo }: { hasLogo: boolean }) {
  const [series, setSeries] = useState<Series>("feed");
  const [format, setFormat] = useState("social_square");
  const [theme, setTheme] = useState("");
  const [subject, setSubject] = useState("");
  const [slideCount, setSlideCount] = useState(5);
  const [tiles, setTiles] = useState<PlannedTile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function plan() {
    setLoading(true);
    setNote(null);
    try {
      const res = await fetch("/api/series-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(series === "feed" ? { series, theme, format } : { series, subject, slides: slideCount, format }),
      });
      const data = (await res.json()) as { tiles?: PlannedTile[]; slides?: TilePlan[]; source?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "indisponible");
      if (series === "feed") {
        if (!data.tiles?.length) throw new Error("Le planificateur n’a pas répondu. Réessayez dans un instant.");
        setTiles(data.tiles);
      } else {
        if (!data.slides?.length) throw new Error("Le rédacteur n’a pas répondu. Réessayez dans un instant.");
        const total = data.slides.length;
        setTiles(data.slides.map((slide, i) => ({ ...slide, kind: carouselSlideKind(i, total), background: "brand" as Background })));
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  function update(index: number, patch: Partial<PlannedTile>) {
    setTiles((current) => (current ? current.map((t, i) => (i === index ? { ...t, ...patch } : t)) : current));
  }

  const cost = tiles ? (tiles.length * (hasLogo ? 3.9 : 2.4)).toFixed(0) : null;

  return (
    <div className="grid gap-4">
      <div role="group" aria-label="Type de série" className="flex gap-1 self-start rounded-pill bg-soft p-1">
        <button type="button" aria-pressed={series === "feed"} onClick={() => { setSeries("feed"); setTiles(null); setFormat("social_square"); }} className={TAB}>
          <Grid3x3 size={14} strokeWidth={1.75} /> Feed de {FEED_SIZE}
        </button>
        <button type="button" aria-pressed={series === "carousel"} onClick={() => { setSeries("carousel"); setTiles(null); setFormat("social_portrait"); }} className={TAB}>
          <GalleryHorizontal size={14} strokeWidth={1.75} /> Carrousel
        </button>
      </div>

      {series === "feed" ? (
        <label className="grid gap-1">
          <span className="text-small font-semibold text-ink">Un thème, une période ? <span className="font-normal text-mute">Facultatif.</span></span>
          <input value={theme} onChange={(e) => setTheme(e.target.value)} maxLength={600} placeholder="Le lancement de la carte d’automne, la rentrée, les fêtes…" className={FIELD} />
        </label>
      ) : (
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <label className="grid gap-1">
            <span className="text-small font-semibold text-ink">Le sujet du carrousel</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={600} required placeholder="5 erreurs qu’on fait avec un levain maison" className={FIELD} />
          </label>
          <label className="grid gap-1">
            <span className="text-small font-semibold text-ink">Diapositives</span>
            <select value={slideCount} onChange={(e) => setSlideCount(Number(e.target.value))} className={FIELD}>
              {Array.from({ length: CAROUSEL_MAX - CAROUSEL_MIN + 1 }, (_, i) => CAROUSEL_MIN + i).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Format" className="flex gap-1 rounded-pill bg-soft p-1">
          {FORMATS[series].map((f) => (
            <button key={f.key} type="button" aria-pressed={format === f.key} onClick={() => setFormat(f.key)} className={TAB}>{f.label}</button>
          ))}
        </div>
        <button type="button" onClick={() => void plan()} disabled={loading || (series === "carousel" && !subject.trim())} className="inline-flex items-center gap-2 rounded-pill bg-ink px-4 py-2 text-small font-semibold text-card transition duration-(--duration-fast) ease-cimaise hover:-translate-y-px disabled:opacity-50">
          {loading ? <LoaderCircle size={16} strokeWidth={1.75} className="animate-spin" /> : tiles ? <RefreshCw size={16} strokeWidth={1.75} /> : <Sparkles size={16} strokeWidth={1.75} />}
          {loading ? "Le planificateur travaille…" : tiles ? "Replanifier" : series === "feed" ? "Planifier les 9 tuiles" : "Écrire le carrousel"}
        </button>
      </div>
      {note ? <p className="text-small text-danger">{note}</p> : null}

      {tiles ? (
        <form action={createSeries} className="grid gap-4 rounded-inner bg-tint p-4 transition-colors duration-(--duration-retint) ease-cimaise">
          <input type="hidden" name="series" value={series} />
          <input type="hidden" name="format" value={format} />
          <input type="hidden" name="series_plan" value={JSON.stringify(tiles)} />
          <p className="text-small text-ink">
            {series === "feed" ? "Les 9 tuiles dans l’ordre du feed (la première en haut à gauche). " : "Les diapositives dans l’ordre. "}
            Relisez les textes, corrigez, puis lancez : tout est dessiné d’un coup.
          </p>
          <ol className={`grid gap-3 ${series === "feed" ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
            {tiles.map((tile, i) => (
              <li key={i} className={`grid content-start gap-2 rounded-inner p-3 ${tile.background === "dark" ? "bg-ink text-card" : tile.background === "light" ? "bg-card text-ink" : "bg-brand text-on-brand"}`}>
                <span className="flex items-center justify-between gap-2 font-mono text-meta opacity-80">
                  <span>{series === "feed" ? `${i + 1} · ${TILE_KINDS[tile.kind].label}` : `Diapo ${i + 1}/${tiles.length}`}</span>
                  {series === "feed" ? <span>{BACKGROUND_LABEL[tile.background].replace("fond ", "")}</span> : null}
                </span>
                <input value={tile.headline} onChange={(e) => update(i, { headline: e.target.value })} maxLength={60} aria-label={`Titre ${i + 1}`} className="w-full bg-transparent text-title font-semibold outline-none placeholder:opacity-60" placeholder="Titre" />
                <input value={tile.subline} onChange={(e) => update(i, { subline: e.target.value })} maxLength={120} aria-label={`Sous-titre ${i + 1}`} className="w-full bg-transparent text-small outline-none placeholder:opacity-60" placeholder="Sous-titre (facultatif)" />
                {tile.kind === "list" || tile.kind === "menu" ? (
                  <textarea value={(tile.items ?? []).join("\n")} onChange={(e) => update(i, { items: e.target.value.split("\n").slice(0, 5) })} rows={3} aria-label={`Items ${i + 1}`} className="w-full resize-none bg-transparent font-mono text-meta outline-none placeholder:opacity-60" placeholder="Un item par ligne" />
                ) : null}
                {tile.cta ? <span className="justify-self-start rounded-pill bg-card/20 px-2 py-0.5 font-mono text-meta">{tile.cta}</span> : null}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono text-meta text-mute">
              {tiles.length} images · environ {cost} centimes · 1 à 2 minutes{hasLogo ? " · logo posé sur chaque tuile" : ""}
            </span>
            <SubmitButton pendingLabel={`Dessin des ${tiles.length} tuiles… (1 à 2 min)`}>
              <Sparkles size={16} strokeWidth={1.75} /> Dessiner {series === "feed" ? "le feed" : "le carrousel"}
            </SubmitButton>
          </div>
        </form>
      ) : null}
    </div>
  );
}
