import Link from "next/link";
import { Grid3x3 } from "lucide-react";
import { Card, Empty, Meta, Notice } from "@/components/ui";
import { outImageUrl, type OutPayload } from "@/lib/outs";
import { FEED_SIZE } from "@/lib/tiles/model";

type Out = { id: string; status: string; created_at: string; payload: OutPayload | null };

/**
 * The feed as Instagram will show it: the nine most recent kept creations, newest first, in a 3×3 grid,
 * with the rhythm of the backgrounds visible. A freshly drawn series (`lot`) is shown in its planned order.
 */
export function FeedView({ outs, lot, brandName }: { outs: Out[]; lot: string | null; brandName: string }) {
  const series = lot ? outs.filter((o) => o.payload?.batch_id === lot).sort((a, b) => (a.payload?.feed_index ?? 0) - (b.payload?.feed_index ?? 0)) : [];
  const kept = outs.filter((o) => o.status === "ready").slice(0, FEED_SIZE);
  const shown = series.length ? series : kept;
  const missing = lot && series.length && series.length < FEED_SIZE ? FEED_SIZE - series.length : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Card className="lg:col-span-5">
        <div className="mx-auto max-w-sm rounded-[2rem] bg-ink p-3 shadow-lift">
          <div className="rounded-[1.5rem] bg-card p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-title text-ink">{brandName.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "")}</span>
              <Grid3x3 size={16} strokeWidth={1.75} className="text-mute" />
            </div>
            {shown.length ? (
              <div className="grid grid-cols-3 gap-0.5">
                {shown.map((out) => {
                  const src = outImageUrl(out.payload);
                  return (
                    <Link key={out.id} href={`/app/studio?focus=${out.id}`} className="relative block aspect-square overflow-hidden bg-tint">
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src} alt={out.payload?.tile?.copy.headline || out.payload?.brief || ""} loading="lazy" className="absolute inset-0 size-full object-cover" />
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="px-1 py-8 text-center text-small text-mute">Rien à montrer : gardez des créations, ou composez un feed.</p>
            )}
          </div>
        </div>
      </Card>

      <div className="grid content-start gap-4 lg:col-span-7">
        {series.length ? (
          <Notice tone={missing ? "warning" : "success"}>
            Le feed vient d’être dessiné, dans l’ordre prévu.{missing ? ` ${missing} tuile${missing > 1 ? "s" : ""} n’${missing > 1 ? "ont" : "a"} pas abouti.` : ""} Chaque tuile est un brouillon sur le mur : gardez, retouchez, planifiez.
          </Notice>
        ) : (
          <Card>
            <Meta>Ce que vous voyez</Meta>
            <p className="mt-2 text-small text-ink">Les {FEED_SIZE} dernières créations gardées, dans l’ordre où Instagram les montrera (la plus récente en haut à gauche). C’est là qu’on voit si les fonds alternent et si les types de tuiles se mélangent.</p>
          </Card>
        )}
        {!shown.length && !lot ? (
          <Empty title="Un feed se juge en grille">
            Composez un feed de {FEED_SIZE} depuis le mur : Brand OS planifie les tuiles, alterne les fonds et mélange les types, vous relisez, tout est dessiné d’un coup.
          </Empty>
        ) : null}
        {shown.length ? (
          <ol className="grid gap-2 sm:grid-cols-3">
            {shown.map((out, i) => (
              <li key={out.id} className="grid gap-0.5 rounded-inner bg-card p-3">
                <Meta>{i + 1}{out.payload?.tile ? ` · ${out.payload.tile.background}` : ""}</Meta>
                <span className="line-clamp-2 text-small text-ink">{out.payload?.tile?.copy.headline || out.payload?.brief || "Sans texte"}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}
