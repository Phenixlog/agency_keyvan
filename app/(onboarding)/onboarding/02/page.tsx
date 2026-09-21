import { redirect } from "next/navigation";
import { ArrowRight, Globe, TextQuote } from "lucide-react";
import { Step } from "@/components/onboarding/Step";
import { Meta } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { extractUrl, requireOnboardingBrand, scrapeUrl, upsertOnboardingSession } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export default async function OB02() {
  const { session } = await requireOnboardingBrand();
  const url = extractUrl(session.seed);

  async function startScrape() {
    "use server";
    const { user, session, brandId } = await requireOnboardingBrand();
    const seed = session.seed || "";
    const url = extractUrl(seed);
    if (url) {
      const corpus = await scrapeUrl(url);
      await upsertOnboardingSession({
        userId: user.id,
        orgId: session.org_id,
        seed,
        brandId,
        scrape: { url, corpus },
      });
    }
    redirect("/onboarding/03");
  }

  return (
    <Step
      step={2}
      back="/onboarding/01"
      title={url ? "On lit le site" : "On part de votre description"}
      intro={
        url
          ? "Brand OS lit la page publique de la marque pour en tirer sa matière première : ce qu’elle dit, à qui, et comment."
          : "Aucune adresse de site détectée : l’analyse s’appuiera uniquement sur votre texte. Vous pouvez revenir en arrière pour en ajouter une."
      }
    >
      <div className="flex items-center gap-4 rounded-inner bg-soft p-4">
        <span className="grid size-10 flex-none place-items-center rounded-pill bg-card text-ink">
          {url ? <Globe size={18} strokeWidth={1.75} /> : <TextQuote size={18} strokeWidth={1.75} />}
        </span>
        <div className="min-w-0">
          <Meta>{url ? "Source détectée" : "Votre description"}</Meta>
          <p className={`text-body text-ink ${url ? "truncate" : "line-clamp-3"}`}>{url ?? session.seed}</p>
        </div>
      </div>
      <form action={startScrape} className="grid">
        <SubmitButton pendingLabel="Lecture du site…" className="justify-self-end">
          {url ? "Lire le site" : "Continuer"} <ArrowRight size={18} strokeWidth={1.75} />
        </SubmitButton>
      </form>
    </Step>
  );
}
