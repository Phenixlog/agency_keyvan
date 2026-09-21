import { Lightbulb } from "lucide-react";
import { formatLabel } from "@/components/app/OutTile";
import { outImageUrl, type OutPayload } from "@/lib/outs";

type Creation = { id: string; payload: OutPayload | null };

/** Pick a kept creation by its image, not by a line of text: this product is visual. */
export function CreationPicker({ creations, selected, name = "outId" }: { creations: readonly Creation[]; selected?: string | null; name?: string }) {
  const current = creations.some((c) => c.id === selected) ? selected : "";
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      <label className="flex-none cursor-pointer">
        <input type="radio" name={name} value="" defaultChecked={!current} className="peer sr-only" />
        <span className="grid size-20 place-items-center rounded-inner bg-soft text-mute transition duration-(--duration-fast) ease-cimaise peer-checked:outline-2 peer-checked:outline-offset-2 peer-checked:outline-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink">
          <Lightbulb size={18} strokeWidth={1.75} />
        </span>
        <span className="mt-1 block w-20 truncate text-center font-mono text-meta text-mute">Simple idée</span>
      </label>
      {creations.map((creation) => {
        const src = outImageUrl(creation.payload);
        return (
          <label key={creation.id} className="flex-none cursor-pointer" title={creation.payload?.brief || "Sans brief"}>
            <input type="radio" name={name} value={creation.id} defaultChecked={creation.id === current} className="peer sr-only" />
            <span className="relative block size-20 overflow-hidden rounded-inner bg-tint transition duration-(--duration-fast) ease-cimaise peer-checked:outline-2 peer-checked:outline-offset-2 peer-checked:outline-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink">
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={creation.payload?.brief || "Création"} loading="lazy" className="absolute inset-0 size-full object-cover" />
              ) : null}
            </span>
            <span className="mt-1 block w-20 truncate text-center font-mono text-meta text-mute">{formatLabel(creation.payload)}</span>
          </label>
        );
      })}
    </div>
  );
}
