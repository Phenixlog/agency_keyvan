import { redirect } from "next/navigation";
import { ArrowUpRight, Pin } from "lucide-react";
import { BrandCard, ButtonLink, Card, CardHeader, Empty, Field, Meta, Notice, Tag, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { IMAGE_FORMATS, type ImageFormat } from "@/lib/brand-os";
import { getJob } from "@/lib/jobs/engine";
import { outImageUrl, setOutStatus, type OutPayload } from "@/lib/outs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";
import { launchGeneration } from "./actions";

export const dynamic = "force-dynamic";

const MAX_BRIEF = 800;
const FORMATS = Object.entries(IMAGE_FORMATS) as [ImageFormat, (typeof IMAGE_FORMATS)[ImageFormat]][];

export default async function CreerPage({ searchParams }: { searchParams: Promise<{ job?: string; brief?: string }> }) {
  const { brand, os, mega } = await getWorkspace();
  const { job: jobId, brief: suggestedBrief } = await searchParams;

  if (!brand) {
    return (
      <Empty title="Aucune marque à illustrer" action={<ButtonLink href="/onboarding">Analyser une marque</ButtonLink>}>
        Créez d’abord le Brand OS d’une marque : c’est lui qui donne leur direction aux visuels.
      </Empty>
    );
  }

  // Generation runs inside the action, so the job is already finished when this page renders.
  const job = jobId ? await getJob(jobId) : null;
  const outId = (job?.output as { out_id?: string } | null)?.out_id;
  const supabase = await createSupabaseServerClient();
  const { data: result } = outId
    ? await supabase.from("outs").select("id,status,payload").eq("id", outId).maybeSingle()
    : { data: null };
  const resultPayload = result?.payload as OutPayload | null;
  const resultSrc = outImageUrl(resultPayload);

  async function keep(formData: FormData) {
    "use server";
    await getWorkspace();
    await setOutStatus(String(formData.get("outId")), "ready");
    redirect(`/app/creer?job=${String(formData.get("jobId"))}`);
  }

  const canon = os?.canon;
  const rules = mega?.rules ?? [];

  return (
    <>
      <header>
        <Meta>Créer · {brand.name}</Meta>
        <h1 className="mt-2 font-display text-display text-ink">Un nouveau visuel</h1>
      </header>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <form action={launchGeneration} className="grid gap-6">
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-small font-semibold text-ink">Format</legend>
              <div className="flex flex-wrap gap-2">
                {FORMATS.map(([key, format], index) => (
                  <label key={key} className="cursor-pointer">
                    <input type="radio" name="format" value={key} defaultChecked={index === 0} className="peer sr-only" />
                    <span className="inline-flex rounded-pill bg-soft px-4 py-2 text-small text-mute transition duration-(--duration-fast) ease-cimaise peer-checked:bg-ink peer-checked:text-card peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink">
                      {format.label}
                    </span>
                  </label>
                ))}
              </div>
              <span className="text-small text-mute">
                Les affiches sont au ratio A (1:√2), jusqu’à 1536 px : parfaites pour l’écran et la maquette, pas pour une
                impression 300 dpi.
              </span>
            </fieldset>

            <Field label="Brief" hint="Facultatif. Une scène, un objet, une situation. Sans brief, Brand OS illustre la promesse de la marque.">
              <Textarea name="brief" rows={4} maxLength={MAX_BRIEF} defaultValue={suggestedBrief?.slice(0, MAX_BRIEF) ?? ""} placeholder="Un bol fumant sur une table en bois, lumière du matin…" />
            </Field>

            <SubmitButton pendingLabel="Création en cours… (≈ 20 s)" className="justify-self-start">
              Créer le visuel
            </SubmitButton>
          </form>
        </Card>

        <BrandCard className="lg:col-span-5">
          <div className="grid gap-4">
            <span className="font-mono text-meta opacity-80">Ce que Brand OS ajoute à votre brief</span>
            <p className="font-display text-h2 font-normal">
              {canon ? `${canon.visual.style}. ${canon.visual.mood}.` : "Le Brand OS de cette marque n’a pas encore de direction visuelle."}
            </p>
            {canon?.visual.palette.length ? <p className="text-small opacity-80">Palette : {canon.visual.palette.join(" · ")}</p> : null}
            {canon?.visual.avoid.length ? <p className="text-small opacity-80">À éviter : {canon.visual.avoid.join(" · ")}</p> : null}
            <p className="text-small opacity-80">
              {rules.length
                ? `+ ${rules.length} règle${rules.length > 1 ? "s" : ""} apprise${rules.length > 1 ? "s" : ""} de vos remarques`
                : "Aucune règle apprise pour l’instant."}
            </p>
          </div>
        </BrandCard>

        {job ? (
          <Card className="lg:col-span-12">
            <CardHeader
              title="Résultat"
              aside={
                <ButtonLink href={outId ? `/app/studio?focus=${outId}` : "/app/studio"} variant="ghost">
                  Voir dans le Studio <ArrowUpRight size={18} strokeWidth={1.75} />
                </ButtonLink>
              }
            />
            {job.status === "failed" ? (
              <Notice tone="danger">La création a échoué : {job.error || "erreur inconnue"}. Vous pouvez relancer.</Notice>
            ) : resultSrc ? (
              <div className="grid gap-4 md:grid-cols-[minmax(0,24rem)_1fr]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resultSrc} alt={resultPayload?.brief || "Création"} className="w-full rounded-inner bg-tint" />
                <div className="grid content-start justify-items-start gap-4">
                  <Meta>{resultPayload?.format ? IMAGE_FORMATS[resultPayload.format as ImageFormat]?.label : "Social 1:1"}</Meta>
                  <p className="text-body text-ink">{resultPayload?.brief || "Sans brief : illustration de la promesse de la marque."}</p>
                  {result?.status === "ready" ? (
                    <Tag tone="success">
                      <Pin size={12} strokeWidth={1.75} /> Gardée
                    </Tag>
                  ) : (
                    <form action={keep}>
                      <input type="hidden" name="outId" value={result?.id} />
                      <input type="hidden" name="jobId" value={job.id} />
                      <SubmitButton variant="soft" pendingLabel="…">
                        <Pin size={18} strokeWidth={1.75} /> Garder
                      </SubmitButton>
                    </form>
                  )}
                </div>
              </div>
            ) : (
              <Notice tone="warning">Création terminée, mais l’image est introuvable. Consultez le Studio.</Notice>
            )}
          </Card>
        ) : null}
      </div>
    </>
  );
}
