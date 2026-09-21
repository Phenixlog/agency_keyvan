import Link from "next/link";
import { Clock, Pin } from "lucide-react";
import { Meta } from "@/components/ui";
import { resolveFormat } from "@/lib/brand-os";
import { outImageUrl, type OutPayload } from "@/lib/outs";

export type OutRow = { id: string; kind: string; status: string; created_at: string; payload: OutPayload | null };

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

/** Custom formats carry their own label; catalogue ones are looked up (older creations included). */
export function formatLabel(payload: OutPayload | null): string {
  return payload?.format_label || resolveFormat(payload?.format).label;
}

/** Une création épinglée au mur : l'image d'abord, l'annotation en mono dessous. */
export function OutTile({ out }: { out: OutRow }) {
  const src = outImageUrl(out.payload);
  const kept = out.status === "ready";
  return (
    // minmax(0,1fr): without it the image's intrinsic width (1024 px) sizes the column and the tile bursts out of its cell.
    <Link href={`/app/studio?focus=${out.id}`} className="group grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
      <div className="relative aspect-square overflow-hidden rounded-inner bg-tint transition duration-(--duration-base) ease-cimaise group-hover:-translate-y-1 group-hover:shadow-lift">
        {src ? (
          // Generated images live on Supabase Storage or the generator's CDN: plain <img>, no optimizer config needed.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={out.payload?.brief || "Création"} loading="lazy" className="absolute inset-0 size-full object-cover" />
        ) : null}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-pill bg-card px-2 py-1 font-mono text-meta text-ink">
          {kept ? <Pin size={12} strokeWidth={1.75} /> : <Clock size={12} strokeWidth={1.75} />}
          {kept ? "Gardée" : "Brouillon"}
        </span>
      </div>
      <div className="grid gap-1">
        <span className="truncate text-small text-ink">{out.payload?.brief || "Sans brief"}</span>
        <Meta className="whitespace-nowrap">
          {formatLabel(out.payload)} · {DATE.format(new Date(out.created_at))}
        </Meta>
      </div>
    </Link>
  );
}
