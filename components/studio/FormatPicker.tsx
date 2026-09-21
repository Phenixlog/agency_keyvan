"use client";

import { useState } from "react";
import { Ruler } from "lucide-react";

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
  const current = formats.find((f) => f.key === selected);

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
        <button type="button" aria-pressed={family === CUSTOM} onClick={() => { setFamily(CUSTOM); setSelected(CUSTOM); }} className={TAB}>
          Sur mesure
        </button>
      </div>

      {family === CUSTOM ? (
        <div className="grid gap-4 rounded-inner bg-soft p-4 md:grid-cols-[1fr_auto]">
          <label className="grid gap-2">
            <span className="text-small font-semibold text-ink">C’est pour quoi ?</span>
            <input name="customUse" required maxLength={120} placeholder="« étiquette de pot de miel », « fond d’écran de borne », « sac en toile »…" className={`${FIELD} bg-card`} />
            <span className="text-small text-mute">Décrivez le support avec vos mots : l’image est composée pour lui (où regarder, où laisser de la place).</span>
          </label>
          <label className="grid content-start gap-2">
            <span className="text-small font-semibold text-ink">Proportions</span>
            <span className="flex items-center gap-2">
              <span className="text-ink"><RatioGlyph ratio={customRatio} /></span>
              <select name="customRatio" value={customRatio} onChange={(event) => setCustomRatio(event.target.value)} className={`${FIELD} bg-card`}>
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
                onClick={() => setSelected(format.key)}
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
    </fieldset>
  );
}
