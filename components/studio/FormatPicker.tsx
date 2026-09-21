"use client";

import { useEffect, useRef, useState } from "react";
import { GraduationCap, LoaderCircle, RefreshCw, Ruler } from "lucide-react";
import type { LoadedBrief } from "@/lib/expertise";

export type PickerFormat = { key: string; label: string; hint: string; family: string; aspectRatio: string; resolution: string };

const CUSTOM = "custom";
const TAB = "whitespace-nowrap rounded-pill px-3 py-2 text-small text-mute transition duration-(--duration-fast) ease-cimaise hover:text-ink aria-pressed:bg-ink aria-pressed:text-card";
const FIELD = "w-full rounded-inner bg-soft px-4 py-3 text-body text-ink placeholder:text-mute focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/** The shape of the format, drawn: a ratio is easier to recognise than to read. */
function RatioGlyph({ ratio }: { ratio: string }) {
  const [w, h] = ratio.split(":").map(Number);
  const wide = w >= h;
  return (
    <span aria-hidden className="grid size-6 flex-none place-items-center">
      <span className="block rounded-xs border border-current" style={{ aspectRatio: `${w} / ${h}`, width: wide ? "100%" : "auto", height: wide ? "auto" : "100%" }} />
    </span>
  );
}

/**
 * Formats are grouped by where the image will live, not by ratio: nobody thinks "2:1", they think
 * "the image of my newsletter". "Sur mesure" is the open door for every medium not listed.
 * Submits `format`, plus `customRatio` and `customUse` when the format is custom.
 */
export function FormatPicker({
  formats,
  families,
  ratios,
  defaultFormat,
}: {
  formats: PickerFormat[];
  families: Record<string, string>;
  ratios: readonly string[];
  defaultFormat: string;
}) {
  const initial = formats.find((f) => f.key === defaultFormat) ?? formats[0];
  const [family, setFamily] = useState<string>(initial.family);
  const [selected, setSelected] = useState<string>(initial.key);
  const [customRatio, setCustomRatio] = useState<string>("1:1");
  const [customUse, setCustomUse] = useState<string>("");
  const current = formats.find((f) => f.key === selected);

  // The expertise of the chosen medium. Written by the model on first use (≈ 15 s), read back afterwards.
  const [expertise, setExpertise] = useState<LoadedBrief | null>(null);
  const [loading, setLoading] = useState(true); // the default medium's brief is fetched on mount
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);

  /** One request at a time: picking another medium abandons the previous one (it keeps being written server-side and will be instant next time). */
  function requestBrief(format: string, ratio: string, use: string, refresh: boolean): Promise<LoadedBrief> {
    controller.current?.abort();
    controller.current = new AbortController();
    return fetch("/api/expertise", {
      method: "POST",
      signal: controller.current.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, customRatio: ratio, customUse: use, refresh }),
    }).then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))));
  }

  async function fetchBrief(format: string, ratio: string, use: string, refresh = false) {
    const mine = ++request.current;
    setLoading(true);
    if (!refresh) setExpertise(null);
    try {
      const result = await requestBrief(format, ratio, use, refresh);
      // A slower, older answer must not overwrite the medium picked since.
      if (mine === request.current) setExpertise(result);
    } catch {
      if (mine === request.current && !refresh) setExpertise(null);
    } finally {
      if (mine === request.current) setLoading(false);
    }
  }

  // On mount only, and state is set from the promise, never synchronously inside the effect.
  // Afterwards every fetch starts from a user gesture (picking a medium, committing a custom one).
  const mounted = useRef(false);
  useEffect(() => {
    // React's strict mode runs mount effects twice in development: ask once.
    if (mounted.current) return;
    mounted.current = true;
    const mine = ++request.current;
    requestBrief(initial.key, "", "", false)
      .then((result) => mine === request.current && setExpertise(result))
      .catch(() => undefined)
      .finally(() => mine === request.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  const brief = expertise?.brief;
  const hasExpertise = Boolean(brief && (brief.tips.length || brief.questions.length));

  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 text-small font-semibold text-ink">Pour quel support ?</legend>
      <input type="hidden" name="format" value={selected} />

      <div role="group" aria-label="Familles de formats" className="flex gap-1 overflow-x-auto rounded-pill bg-soft p-1">
        {Object.entries(families).map(([key, label]) => (
          <button key={key} type="button" aria-pressed={family === key} onClick={() => setFamily(key)} className={TAB}>
            {label}
          </button>
        ))}
        <button type="button" aria-pressed={family === CUSTOM} onClick={() => {
            setFamily(CUSTOM);
            setSelected(CUSTOM);
            request.current++; // drop any answer still in flight for the previous medium
            setExpertise(null);
            setLoading(false);
            if (customUse.trim()) void fetchBrief(CUSTOM, customRatio, customUse);
          }} className={TAB}>
          Sur mesure
        </button>
      </div>

      {family === CUSTOM ? (
        <div className="grid gap-4 rounded-inner bg-soft p-4 md:grid-cols-[1fr_auto]">
          <label className="grid gap-2">
            <span className="text-small font-semibold text-ink">C’est pour quoi ?</span>
            <input
              name="customUse"
              required
              maxLength={120}
              value={customUse}
              onChange={(event) => setCustomUse(event.target.value)}
              onBlur={() => customUse.trim() && void fetchBrief(CUSTOM, customRatio, customUse)}
              placeholder="« étiquette de pot de miel », « fond d’écran de borne », « sac en toile »…" className={`${FIELD} bg-card`} />
            <span className="text-small text-mute">Décrivez le support avec vos mots : l’image est composée pour lui (où regarder, où laisser de la place).</span>
          </label>
          <label className="grid content-start gap-2">
            <span className="text-small font-semibold text-ink">Proportions</span>
            <span className="flex items-center gap-2">
              <span className="text-ink"><RatioGlyph ratio={customRatio} /></span>
              <select
                name="customRatio"
                value={customRatio}
                onChange={(event) => {
                  setCustomRatio(event.target.value);
                  if (customUse.trim()) void fetchBrief(CUSTOM, event.target.value, customUse);
                }}
                className={`${FIELD} bg-card`}>
                {ratios.map((ratio) => (
                  <option key={ratio} value={ratio}>{ratio}</option>
                ))}
              </select>
            </span>
          </label>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {formats
            .filter((format) => format.family === family)
            .map((format) => (
              <button
                key={format.key}
                type="button"
                aria-pressed={selected === format.key}
                onClick={() => {
                  setSelected(format.key);
                  void fetchBrief(format.key, "", "");
                }}
                className="flex items-center gap-3 rounded-inner bg-soft p-3 text-left text-mute transition duration-(--duration-fast) ease-cimaise hover:text-ink aria-pressed:bg-ink aria-pressed:text-card"
              >
                <RatioGlyph ratio={format.aspectRatio} />
                <span className="min-w-0">
                  <span className="block truncate text-small font-semibold">{format.label}</span>
                  <span className="block truncate font-mono text-meta opacity-80">
                    {format.aspectRatio}
                    {format.resolution === "4k" ? " · 4K imprimable" : ""}
                  </span>
                </span>
              </button>
            ))}
        </div>
      )}

      <p className="flex items-center gap-2 text-small text-mute">
        <Ruler size={14} strokeWidth={1.75} className="flex-none" />
        {selected === CUSTOM ? "Format sur mesure : n’importe quel support, dans les proportions de votre choix." : `${current?.label} — ${current?.hint}`}
      </p>

      {/* ---- L'expertise du support : ce qu'un spécialiste sait, montré au moment de créer ---- */}
      {loading && !expertise ? (
        <p role="status" className="flex items-center gap-2 rounded-inner bg-tint p-4 text-small text-ink">
          <LoaderCircle size={16} strokeWidth={1.75} className="flex-none animate-spin" />
          L’expert de ce support rédige sa fiche : 20 à 40 secondes la première fois, instantané ensuite. Vous pouvez écrire votre brief pendant ce temps.
        </p>
      ) : hasExpertise && brief ? (
        <section aria-label="Expertise du support" className="grid gap-4 rounded-inner bg-tint p-4 transition-colors duration-(--duration-retint) ease-cimaise">
          <header className="flex items-start justify-between gap-3">
            <span className="flex items-center gap-2 text-small font-semibold text-ink">
              <GraduationCap size={16} strokeWidth={1.75} className="flex-none" /> Ce qu’un spécialiste de ce support sait
            </span>
            <button
              type="button"
              onClick={() => void fetchBrief(selected, customRatio, customUse, true)}
              disabled={loading}
              title="Faire réécrire cette fiche"
              className="inline-flex flex-none items-center gap-1 font-mono text-meta text-mute transition duration-(--duration-fast) ease-cimaise hover:text-ink disabled:opacity-50"
            >
              <RefreshCw size={12} strokeWidth={1.75} className={loading ? "animate-spin" : ""} /> Réécrire
            </button>
          </header>

          {brief.summary ? <p className="text-small text-ink">{brief.summary}</p> : null}

          {brief.tips.length ? (
            <ul className="grid gap-2">
              {brief.tips.map((tip, index) => (
                <li key={tip} className="flex gap-3 text-small text-ink">
                  <span className="font-mono text-meta text-mute">{String(index + 1).padStart(2, "0")}</span>
                  {tip}
                </li>
              ))}
            </ul>
          ) : null}

          {brief.questions.map((question) => (
            <div key={question.id} className="grid gap-2">
              <span className="text-small font-semibold text-ink">{question.label}</span>
              <div className="flex flex-wrap gap-2">
                {["", ...question.options].map((option, index) => (
                  <label key={option || "none"} className="cursor-pointer">
                    <input type="radio" name={`q:${question.id}`} value={option} defaultChecked={index === 0} className="peer sr-only" />
                    <span className="inline-flex rounded-pill bg-card px-3 py-1 text-small text-mute transition duration-(--duration-fast) ease-cimaise peer-checked:bg-ink peer-checked:text-card peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink">
                      {option || "Peu importe"}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}

          <details>
            <summary className="cursor-pointer list-none font-mono text-meta text-mute">Voir la fiche complète</summary>
            <dl className="mt-3 grid gap-4 md:grid-cols-3">
              {(
                [
                  ["Contraintes du support", brief.constraints],
                  ["Règles de composition", brief.composition],
                  ["Erreurs fréquentes", brief.mistakes],
                ] as const
              ).map(([title, items]) =>
                items.length ? (
                  <div key={title} className="grid content-start gap-2">
                    <dt className="font-mono text-meta text-mute">{title}</dt>
                    <dd>
                      <ul className="grid gap-1">
                        {items.map((item) => (
                          <li key={item} className="text-small text-ink">{item}</li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                ) : null
              )}
            </dl>
          </details>
        </section>
      ) : expertise?.source === "fallback" ? (
        <p className="text-small text-mute">L’expertise détaillée de ce support n’est pas disponible pour l’instant : la création utilisera une consigne de composition simple.</p>
      ) : null}
    </fieldset>
  );
}
