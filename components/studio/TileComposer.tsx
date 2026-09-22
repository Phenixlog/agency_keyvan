"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, PenLine, RefreshCw, Type } from "lucide-react";
import type { TileKind, TilePlan } from "@/lib/tiles/model";

const FIELD = "w-full rounded-inner bg-card px-3 py-2 text-body text-ink placeholder:text-mute focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const CHIP = "cursor-pointer";
const CHIP_INNER = "inline-flex rounded-pill bg-card px-3 py-1 text-small text-mute transition duration-(--duration-fast) ease-cimaise peer-checked:bg-ink peer-checked:text-card peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink";

/**
 * "Avec texte": the words of the tile, drafted by the model in the brand's voice from the brief and the
 * kind of tile, shown in editable fields before any image is paid for (Keyvan: prices and names must be
 * right first). Submits `tile_mode`, `tile_kind` and the four text fields; the format comes from the picker.
 */
export function TileComposer({ kinds, format, customUse, hasLogo, initial = null }: { kinds: Record<string, { label: string; hint: string }>; format: string; customUse: string; hasLogo: boolean; initial?: { kind: TileKind; headline: string } | null }) {
  const [withText, setWithText] = useState(Boolean(initial));
  const [kind, setKind] = useState<TileKind>(initial?.kind ?? "hook_photo");
  const [plan, setPlan] = useState<TilePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);

  /** The brief lives in the same form, outside this component: read it when drafting. */
  function currentBrief(): string {
    const form = root.current?.closest("form");
    const field = form?.elements.namedItem("brief");
    return field instanceof HTMLTextAreaElement ? field.value : "";
  }

  async function draft(nextKind: TileKind, headline?: string) {
    controller.current?.abort();
    controller.current = new AbortController();
    setLoading(true);
    setNote(null);
    try {
      const res = await fetch("/api/tile-copy", {
        method: "POST",
        signal: controller.current.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: nextKind, brief: currentBrief(), format, customUse, headline: headline ?? "" }),
      });
      if (!res.ok) throw new Error("indisponible");
      const data = (await res.json()) as { plan: TilePlan; source: "llm" | "fallback" };
      setPlan(data.plan);
      if (data.source === "fallback") setNote("Le rédacteur n’a pas répondu : le brief sert de titre, corrigez à la main.");
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setNote("Rédaction impossible pour l’instant : écrivez le texte à la main.");
    } finally {
      setLoading(false);
    }
  }

  // Planned by the calendar: the headline is set, the writer completes the rest as soon as the form is there.
  useEffect(() => {
    // Deferred by a tick: the first render is the form itself, the writer starts right after.
    const timer = initial ? setTimeout(() => void draft(initial.kind, initial.headline), 0) : null;
    return () => {
      if (timer) clearTimeout(timer);
      controller.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={root} className="grid gap-3">
      <input type="hidden" name="tile_mode" value={withText ? "text" : "none"} />
      <div role="group" aria-label="Texte sur le visuel" className="flex gap-1 self-start rounded-pill bg-soft p-1">
        <button type="button" aria-pressed={!withText} onClick={() => setWithText(false)} className="whitespace-nowrap rounded-pill px-3 py-2 text-small text-mute transition duration-(--duration-fast) ease-cimaise hover:text-ink aria-pressed:bg-ink aria-pressed:text-card">
          Image seule
        </button>
        <button
          type="button"
          aria-pressed={withText}
          onClick={() => {
            setWithText(true);
            if (!plan) void draft(kind);
          }}
          className="inline-flex items-center gap-2 whitespace-nowrap rounded-pill px-3 py-2 text-small text-mute transition duration-(--duration-fast) ease-cimaise hover:text-ink aria-pressed:bg-ink aria-pressed:text-card"
        >
          <Type size={14} strokeWidth={1.75} /> Avec texte
        </button>
      </div>

      {withText ? (
        <section aria-label="La tuile" className="grid gap-4 rounded-inner bg-tint p-4 transition-colors duration-(--duration-retint) ease-cimaise">
          <input type="hidden" name="tile_kind" value={kind} />
          <div className="grid gap-2">
            <span className="text-small font-semibold text-ink">Quel type de tuile ?</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(kinds).map(([key, { label, hint }]) => (
                <label key={key} className={CHIP} title={hint}>
                  <input
                    type="radio"
                    name="tile_kind_choice"
                    value={key}
                    checked={kind === key}
                    onChange={() => {
                      setKind(key as TileKind);
                      void draft(key as TileKind);
                    }}
                    className="peer sr-only"
                  />
                  <span className={CHIP_INNER}>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-start justify-between gap-3">
            <span className="flex items-center gap-2 text-small font-semibold text-ink">
              <PenLine size={16} strokeWidth={1.75} className="flex-none" /> Le texte de la tuile, dans la voix de la marque
            </span>
            <button type="button" onClick={() => void draft(kind)} disabled={loading} className="inline-flex flex-none items-center gap-1 font-mono text-meta text-mute transition duration-(--duration-fast) ease-cimaise hover:text-ink disabled:opacity-50">
              <RefreshCw size={12} strokeWidth={1.75} className={loading ? "animate-spin" : ""} /> Réécrire d’après le brief
            </button>
          </div>

          {loading && !plan ? (
            <p role="status" className="flex items-center gap-2 text-small text-ink">
              <LoaderCircle size={16} strokeWidth={1.75} className="animate-spin" /> Le rédacteur écrit…
            </p>
          ) : null}
          {note ? <p className="text-small text-warning">{note}</p> : null}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 md:col-span-2">
              <span className="font-mono text-meta text-mute">Titre · gros, 2 à 7 mots</span>
              <input name="tile_headline" maxLength={60} required={withText} value={plan?.headline ?? ""} onChange={(e) => setPlan((p) => ({ ...(p ?? EMPTY), headline: e.target.value }))} className={`${FIELD} font-semibold`} placeholder="Le levain du samedi" />
            </label>
            <label className="grid gap-1">
              <span className="font-mono text-meta text-mute">Sous-titre</span>
              <input name="tile_subline" maxLength={120} value={plan?.subline ?? ""} onChange={(e) => setPlan((p) => ({ ...(p ?? EMPTY), subline: e.target.value }))} className={FIELD} placeholder="Facultatif" />
            </label>
            <label className="grid gap-1">
              <span className="font-mono text-meta text-mute">Petite ligne</span>
              <input name="tile_caption" maxLength={160} value={plan?.caption ?? ""} onChange={(e) => setPlan((p) => ({ ...(p ?? EMPTY), caption: e.target.value }))} className={FIELD} placeholder="Horaire, lieu, détail…" />
            </label>
            <label className="grid gap-1">
              <span className="font-mono text-meta text-mute">Bouton</span>
              <input name="tile_cta" maxLength={40} value={plan?.cta ?? ""} onChange={(e) => setPlan((p) => ({ ...(p ?? EMPTY), cta: e.target.value }))} className={FIELD} placeholder="Commander, Réserver…" />
            </label>
            {kind === "list" || kind === "menu" ? (
              <label className="grid gap-1 md:col-span-2">
                <span className="font-mono text-meta text-mute">Les items · un par ligne, 3 à 5 {kind === "menu" ? "· « Nom — prix »" : ""}</span>
                <textarea name="tile_items" rows={4} value={(plan?.items ?? []).join("\n")} onChange={(e) => setPlan((p) => ({ ...(p ?? EMPTY), items: e.target.value.split("\n") }))} className={FIELD} placeholder={kind === "menu" ? "Pain au levain — 4,20 €" : "Le levain, nourri chaque jour"} />
              </label>
            ) : null}
            <label className="grid gap-1 md:col-span-2">
              <span className="font-mono text-meta text-mute">La photo sur la tuile (en anglais, pour le modèle) · vide = tuile typographique</span>
              <input name="tile_scene" maxLength={400} value={plan?.scene ?? ""} onChange={(e) => setPlan((p) => ({ ...(p ?? EMPTY), scene: e.target.value }))} className={FIELD} placeholder="a cut-out sourdough loaf…" />
            </label>
          </div>
          <input type="hidden" name="tile_logo_placement" value={plan?.logoPlacement ?? "top-left"} />
          <p className="font-mono text-meta text-mute">
            Le texte est dessiné tel quel par le modèle d’image, puis relu : une coquille est signalée sur la tuile. Trois propositions : fond de marque, fond clair, fond sombre.
            {hasLogo ? " Le vrai logo est posé sur chaque tuile." : " Pas de logo déposé : aucun logo ne sera inventé."}
          </p>
        </section>
      ) : null}
    </div>
  );
}

const EMPTY: TilePlan = { headline: "", subline: "", caption: "", cta: "", items: [], scene: "", logoPlacement: "top-left" };
