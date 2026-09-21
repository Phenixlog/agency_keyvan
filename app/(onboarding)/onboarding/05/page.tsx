import { redirect } from "next/navigation";
import { ArrowRight, Pin } from "lucide-react";
import { Step } from "@/components/onboarding/Step";
import { ButtonLink, Field, Input, Meta, Notice, Tag } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { queueSocialGeneration, getJob } from "@/lib/jobs/engine";
import { bumpMegaPrompt } from "@/lib/learning";
import { getOnboardingBrandOS, keepOut, requireOnboardingBrand } from "@/lib/onboarding";
import { outImageUrl, type OutPayload } from "@/lib/outs";

export const dynamic = "force-dynamic";

const MAX_TEXT = 300;

export default async function OB05({ searchParams }: { searchParams: Promise<{ job?: string; learned?: string }> }) {
  const { supabase, brandId } = await requireOnboardingBrand();
  const { job: jobId, learned } = await searchParams;
  const [brand, { data: outs }, job] = await Promise.all([
    getOnboardingBrandOS(brandId),
    supabase
      .from("outs")
      .select("id,payload,status")
      .eq("brand_id", brandId)
      .neq("status", "archived")
      .order("created_at", { ascending: false }),
    jobId ? getJob(jobId) : null,
  ]);
  const keptCount = (outs ?? []).filter((o) => o.status === "ready").length;

  async function launch(formData: FormData) {
    "use server";
    const { user, orgId, brandId } = await requireOnboardingBrand();
    const brief = String(formData.get("brief") || "").trim().slice(0, MAX_TEXT);
    // The action waits for the image (10-25 s): the button shows progress meanwhile.
    const { jobId } = await queueSocialGeneration({ orgId, brandId, userId: user.id, brief });
    redirect(`/onboarding/05?job=${jobId}`);
  }

  async function keep(formData: FormData) {
    "use server";
    await requireOnboardingBrand();
    await keepOut(String(formData.get("outId")));
    redirect("/onboarding/05");
  }

  async function feedback(formData: FormData) {
    "use server";
    const { user, brandId } = await requireOnboardingBrand();
    const text = String(formData.get("feedback") || "").trim().slice(0, MAX_TEXT);
    if (!text) return;
    await bumpMegaPrompt({ brandId, userId: user.id, feedback: text });
    redirect("/onboarding/05?learned=1");
  }

  return (
    <Step
      step={5}
      wide
      back="/onboarding/04"
      brandColor={brand.color}
      title="Une première création"
      intro={`Testez le Brand OS de ${brand.name} sur un vrai visuel. Gardez ce qui vous plaît, dites ce qui ne va pas : chaque remarque devient une règle pour la suite.`}
    >
      {job?.status === "failed" ? (
        <Notice tone="danger">La création a échoué : {job.error || "erreur inconnue"}. Vous pouvez réessayer.</Notice>
      ) : null}
      {learned ? <Notice tone="success">Remarque intégrée : elle s’appliquera aux prochaines créations.</Notice> : null}

      <form action={launch} className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <Field label="Que voulez-vous voir ?" hint="Facultatif. Sans brief, Brand OS illustre la promesse de la marque.">
          <Input name="brief" maxLength={MAX_TEXT} placeholder="Une scène, un objet, une situation…" />
        </Field>
        <SubmitButton pendingLabel="Création en cours… (≈ 20 s)">Créer un visuel 1:1</SubmitButton>
      </form>

      {outs?.length ? (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {outs.map((out) => {
            const payload = out.payload as OutPayload | null;
            const src = outImageUrl(payload);
            return (
              <li key={out.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
                <div className="relative aspect-square overflow-hidden rounded-inner bg-tint">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt={payload?.brief || "Création"} className="absolute inset-0 size-full object-cover" />
                  ) : null}
                </div>
                {out.status === "ready" ? (
                  <Tag tone="success">
                    <Pin size={12} strokeWidth={1.75} /> Gardée
                  </Tag>
                ) : (
                  <form action={keep}>
                    <input type="hidden" name="outId" value={out.id} />
                    <SubmitButton variant="soft" pendingLabel="…" className="w-full">
                      <Pin size={18} strokeWidth={1.75} /> Garder
                    </SubmitButton>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {outs?.length ? (
        <form action={feedback} className="grid gap-4 border-t border-line pt-6 md:grid-cols-[1fr_auto] md:items-end">
          <Field label="Quelque chose ne va pas ?" hint="Exemples : « moins de bleu », « toujours une personne dans le cadre », « pas de texte ».">
            <Input name="feedback" maxLength={MAX_TEXT} required placeholder="Votre remarque" />
          </Field>
          <SubmitButton variant="soft" pendingLabel="Intégration…">En faire une règle</SubmitButton>
        </form>
      ) : null}

      <div className="flex items-center justify-between gap-4 border-t border-line pt-6">
        <Meta>{keptCount} création{keptCount > 1 ? "s" : ""} gardée{keptCount > 1 ? "s" : ""}</Meta>
        <ButtonLink href="/onboarding/06" variant={keptCount ? "primary" : "soft"}>
          Continuer <ArrowRight size={18} strokeWidth={1.75} />
        </ButtonLink>
      </div>
    </Step>
  );
}
