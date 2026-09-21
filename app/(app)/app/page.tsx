import { ArrowUpRight, Plus } from "lucide-react";
import { BrandCard, ButtonLink, Card, CardHeader, Empty, Meta, Tag, VersionTag } from "@/components/ui";
import { OutTile, type OutRow } from "@/components/app/OutTile";
import { CHANNELS, toDay, upcomingEntries } from "@/lib/calendar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const RECENT_OUTS = 4;
const UPCOMING = 3;
const MAX_RULES = 12;
const TODAY = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const SHORT_DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
// Calendar days are dates, not instants: format in UTC so no time zone shifts them.
const DAY_NUMBER = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", timeZone: "UTC" });
const DAY_MONTH = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });

export default async function AppHome() {
  const { brand, brands, os, mega } = await getWorkspace();

  if (!brand) {
    return (
      <Empty
        title="Le mur est encore vide"
        action={
          <ButtonLink href="/onboarding">
            Analyser une première marque <ArrowUpRight size={18} strokeWidth={1.75} />
          </ButtonLink>
        }
      >
        Donnez une URL ou quelques phrases : Brand OS en tire le positionnement, le ton et la direction visuelle, puis
        crée vos premiers visuels.
      </Empty>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: outs } = await supabase
    .from("outs")
    .select("id,kind,status,created_at,payload")
    .eq("brand_id", brand.id)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(RECENT_OUTS);
  const upcoming = await upcomingEntries(brand.id, toDay(new Date()), UPCOMING);

  const today = TODAY.format(new Date());
  const rules = mega?.rules ?? [];

  return (
    <>
      <header>
        <Meta className="block first-letter:uppercase">
          {today} · {brands.length} marque{brands.length > 1 ? "s" : ""} dans l’atelier
        </Meta>
        <h1 className="mt-2 font-display text-display text-ink">
          Au mur aujourd’hui,
          <br />
          <em className="highlighter">{brand.name}</em>
        </h1>
      </header>

      <div className="grid gap-4 lg:grid-cols-12">
        <BrandCard className="lg:col-span-7">
          <div className="grid min-h-56 content-between gap-6">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-meta opacity-80">
                {os ? `Brand OS · v${os.version} · ${SHORT_DATE.format(new Date(os.createdAt))}` : "Brand OS · à construire"}
              </span>
              <ButtonLink href="/app/marque" variant="ghost" className="text-on-brand opacity-80 hover:text-on-brand hover:opacity-100">
                Ouvrir <ArrowUpRight size={18} strokeWidth={1.75} />
              </ButtonLink>
            </div>
            <p className="max-w-[24ch] font-display text-h1">
              {os?.canon?.promise || os?.summary.split("\n")[0] || "Cette marque n’a pas encore de Brand OS."}
            </p>
            {os?.canon?.tone.length ? (
              <ul className="flex flex-wrap gap-2">
                {os.canon.tone.map((tone) => (
                  <li key={tone} className="rounded-pill bg-on-brand/15 px-4 py-1 text-small">
                    {tone}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </BrandCard>

        <Card className="grid content-between gap-4 lg:col-span-5">
          <div>
            <CardHeader title="Nouvelle création" aside={<Meta>brief → image</Meta>} />
            <p className="text-small text-mute">
              Décrivez la scène en une phrase. Brand OS y ajoute la direction visuelle de {brand.name}
              {rules.length ? ` et ses ${rules.length} règle${rules.length > 1 ? "s" : ""} apprise${rules.length > 1 ? "s" : ""}` : ""}.
            </p>
          </div>
          <ButtonLink href="/app/creer">
            <Plus size={18} strokeWidth={1.75} /> Créer un visuel
          </ButtonLink>
        </Card>

        <Card className="lg:col-span-12">
          <CardHeader
            title="Dernières créations"
            aside={
              <ButtonLink href="/app/studio" variant="ghost">
                Tout le Studio <ArrowUpRight size={18} strokeWidth={1.75} />
              </ButtonLink>
            }
          />
          {outs?.length ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {(outs as OutRow[]).map((out) => (
                <OutTile key={out.id} out={out} />
              ))}
            </div>
          ) : (
            <Empty title="Rien d’épinglé pour l’instant">
              Les visuels créés pour {brand.name} apparaîtront ici, du plus récent au plus ancien.
            </Empty>
          )}
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader
            title="Prochaines publications"
            aside={
              <ButtonLink href="/app/calendrier" variant="ghost">
                Calendrier <ArrowUpRight size={18} strokeWidth={1.75} />
              </ButtonLink>
            }
          />
          {upcoming.length ? (
            <ul>
              {upcoming.map((entry) => {
                const date = new Date(`${entry.scheduled_on}T00:00:00Z`);
                return (
                  <li key={entry.id} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-4 border-t border-line py-3 first:border-t-0 first:pt-0">
                    <span className="grid justify-items-center rounded-inner bg-tint py-2 transition-colors duration-(--duration-retint) ease-cimaise">
                      <Meta className="uppercase">{DAY_MONTH.format(date)}</Meta>
                      <span className="font-display text-h2 font-normal leading-none text-ink">{DAY_NUMBER.format(date)}</span>
                    </span>
                    <span className="truncate text-small text-ink">{entry.caption || entry.out?.payload?.brief || "Idée de publication"}</span>
                    <Tag>{CHANNELS[entry.channel]}</Tag>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-small text-mute">Rien de planifié. Les créations gardées se planifient dans le Calendrier.</p>
          )}
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader
            title="Ce que l’atelier a appris"
            aside={
              <span className="flex items-center gap-2">
                {mega ? <VersionTag v={mega.version} /> : null}
                <Meta>
                  {rules.length} règle{rules.length > 1 ? "s" : ""} sur {MAX_RULES}
                </Meta>
              </span>
            }
          />
          {rules.length ? (
            <ul>
              {rules.map((rule, index) => (
                <li key={rule} className="flex items-baseline gap-4 border-t border-line py-3 text-body first:border-t-0 first:pt-0">
                  <Meta>{String(index + 1).padStart(2, "0")}</Meta>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-small text-mute">
              Aucune règle encore. Dans le Studio, dites ce qui ne va pas sur un visuel (« moins de bleu », « toujours une
              personne ») : Brand OS en fait une règle, appliquée à toutes les créations suivantes.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
