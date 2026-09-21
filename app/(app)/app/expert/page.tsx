import { redirect } from "next/navigation";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { MigrationNotice } from "@/components/app/MigrationNotice";
import { BrandCard, ButtonLink, Card, CardHeader, Empty, Meta, Notice, Tag } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { isLlmConfigured } from "@/lib/llm/openrouter";
import { PLAYBOOK_KINDS, generatePlaybooks, getPlaybooks } from "@/lib/playbooks";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

const NOTICES = {
  ok: ["success", "Guides à jour avec le Brand OS actuel."],
  failed: ["danger", "La génération n’a pas abouti. Les guides précédents sont conservés ; réessayez dans un instant."],
  forbidden: ["danger", "La base a refusé l’écriture : les règles d’accès de cette table sont absentes ou incomplètes. Rejouez en entier supabase/migrations/0004_calendar_playbooks.sql dans Supabase → SQL Editor."],
  "no-llm": ["warning", "Analyse IA non configurée sur ce serveur (OPENROUTER_API_KEY manquante)."],
} as const;

export default async function ExpertPage({ searchParams }: { searchParams: Promise<{ etat?: string }> }) {
  const { brand, os, mega } = await getWorkspace();
  const { etat } = await searchParams;

  if (!brand || !os) {
    return (
      <Empty title="Pas encore de guides" action={<ButtonLink href={brand ? "/app/marque" : "/onboarding"}>{brand ? "Ouvrir la marque" : "Analyser une marque"}</ButtonLink>}>
        Les guides Expert sont tirés du Brand OS d’une marque : ligne éditoriale, voix, brief visuel.
      </Empty>
    );
  }

  const stored = await getPlaybooks(brand.id);
  const llmReady = isLlmConfigured();
  const notice = etat && etat in NOTICES ? NOTICES[etat as keyof typeof NOTICES] : null;

  async function generate() {
    "use server";
    const { brand, os, mega, userId } = await getWorkspace();
    if (!brand || !os) redirect("/app");
    const outcome = await generatePlaybooks({
      brand,
      userId,
      summary: os.summary,
      canon: os.canon,
      osVersion: os.version,
      rules: mega?.rules ?? [],
    });
    redirect(`/app/expert?etat=${outcome}`);
  }

  const ready = stored.state === "ready" ? stored : null;
  const stale = ready ? ready.osVersion < os.version : false;

  return (
    <>
      <header>
        <Meta>Expert · {brand.name}</Meta>
        <h1 className="mt-2 font-display text-display text-ink">Les guides de la marque</h1>
      </header>

      {notice ? <Notice tone={notice[0]}>{notice[1]}</Notice> : null}
      {stored.state === "missing-table" ? <MigrationNotice feature="Expert" /> : null}

      <BrandCard>
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div className="grid gap-2">
            <span className="font-mono text-meta opacity-80">
              {ready
                ? `Tirés du Brand OS v${ready.osVersion} · ${DATE.format(new Date(ready.updatedAt))}`
                : `À tirer du Brand OS v${os.version}`}
            </span>
            <p className="max-w-[32ch] font-display text-h1">
              {ready
                ? stale
                  ? "Le Brand OS a changé depuis : ces guides datent."
                  : "Trois guides, écrits pour cette marque et aucune autre."
                : "Ligne éditoriale, voix, brief visuel : à partir de ce que la marque est."}
            </p>
            {(mega?.rules.length ?? 0) > 0 ? (
              <span className="text-small opacity-80">
                Les {mega!.rules.length} règle{mega!.rules.length > 1 ? "s" : ""} apprise{mega!.rules.length > 1 ? "s" : ""} y sont impératives.
              </span>
            ) : null}
          </div>
          {stored.state !== "missing-table" && llmReady ? (
            <form action={generate}>
              <SubmitButton variant="soft" pendingLabel="Rédaction… (≈ 40 s)">
                <RefreshCw size={18} strokeWidth={1.75} /> {ready ? "Régénérer" : "Rédiger les guides"}
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </BrandCard>

      {!llmReady && stored.state !== "missing-table" ? <Notice tone="warning">{NOTICES["no-llm"][1]}</Notice> : null}

      {ready ? (
        <div className="grid gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-12">
            <CardHeader title={PLAYBOOK_KINDS.editorial.label} aside={<Meta>{ready.playbooks.editorial.rhythm}</Meta>} />
            <div className="grid gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
              {ready.playbooks.editorial.pillars.map((block) => (
                <section key={block.pillar} className="border-t border-line pt-4">
                  <h3 className="font-display text-h2 font-normal text-ink">{block.pillar}</h3>
                  <p className="mt-1 text-small text-mute">{block.angle}</p>
                  <ul className="mt-4 grid gap-4">
                    {block.ideas.map((idea) => (
                      <li key={idea.title} className="grid gap-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-title text-ink">{idea.title}</span>
                          <Tag>{idea.format}</Tag>
                        </span>
                        <span className="text-small text-mute">« {idea.hook} »</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </Card>

          <Card className="lg:col-span-7">
            <CardHeader title={PLAYBOOK_KINDS.voice.label} />
            <ul className="grid gap-2">
              {ready.playbooks.voice.principles.map((principle) => (
                <li key={principle} className="border-t border-line pt-2 text-body text-ink first:border-t-0 first:pt-0">
                  {principle}
                </li>
              ))}
            </ul>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div className="grid content-start gap-2">
                <Tag tone="success">La marque dirait</Tag>
                {ready.playbooks.voice.do.map((line) => (
                  <p key={line} className="text-small text-ink">« {line} »</p>
                ))}
              </div>
              <div className="grid content-start gap-2">
                <Tag tone="danger">Jamais</Tag>
                {ready.playbooks.voice.dont.map((line) => (
                  <p key={line} className="text-small text-mute line-through decoration-line">« {line} »</p>
                ))}
              </div>
            </div>
            <dl className="mt-6 grid gap-4 md:grid-cols-2">
              <div>
                <dt><Meta>Mots à employer</Meta></dt>
                <dd className="text-small text-ink">{ready.playbooks.voice.vocabulary.use.join(" · ")}</dd>
              </div>
              <div>
                <dt><Meta>Mots à bannir</Meta></dt>
                <dd className="text-small text-ink">{ready.playbooks.voice.vocabulary.avoid.join(" · ")}</dd>
              </div>
            </dl>
          </Card>

          <Card className="lg:col-span-5">
            <CardHeader title="Légendes modèles" />
            <ul className="grid gap-4">
              {ready.playbooks.voice.captions.map((caption) => (
                <li key={caption.text} className="grid gap-2 rounded-inner bg-soft p-4">
                  <Meta>{caption.channel}</Meta>
                  <p className="whitespace-pre-line text-small text-ink">{caption.text}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="lg:col-span-12">
            <CardHeader title={PLAYBOOK_KINDS.visual.label} aside={<Meta>{PLAYBOOK_KINDS.visual.intro}</Meta>} />
            <ul className="mb-6 grid gap-x-8 md:grid-cols-2">
              {ready.playbooks.visual.principles.map((principle) => (
                <li key={principle} className="border-t border-line py-3 text-body text-ink">
                  {principle}
                </li>
              ))}
            </ul>
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {ready.playbooks.visual.shots.map((shot) => (
                <li key={shot.title} className="grid content-between gap-4 rounded-inner bg-tint p-4">
                  <div className="grid gap-1">
                    <span className="text-title text-ink">{shot.title}</span>
                    <span className="text-small text-ink">{shot.brief}</span>
                  </div>
                  <ButtonLink href={`/app/creer?brief=${encodeURIComponent(shot.brief)}`} variant="ghost" className="justify-self-start text-ink">
                    Créer ce visuel <ArrowUpRight size={16} strokeWidth={1.75} />
                  </ButtonLink>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : stored.state === "empty" ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Object.values(PLAYBOOK_KINDS).map((kind) => (
            <Card key={kind.label}>
              <h2 className="font-display text-h2 font-normal text-ink">{kind.label}</h2>
              <p className="mt-2 text-small text-mute">{kind.intro}</p>
            </Card>
          ))}
        </div>
      ) : null}
    </>
  );
}
