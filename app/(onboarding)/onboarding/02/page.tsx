import { redirect } from "next/navigation";
import { ArrowRight, Globe, TextQuote } from "lucide-react";
import { LogoUploader } from "@/components/onboarding/LogoUploader";
import { Step } from "@/components/onboarding/Step";
import { Meta } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { extractUrl, requireOnboardingBrand, saveBrandSource, scrapeSite, upsertOnboardingSession } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export default async function OB02() {
  const { session, brandId } = await requireOnboardingBrand();
  const url = extractUrl(session.seed);
  const door = session.data.door ?? "oui";

  async function startScrape() {
    "use server";
    const { user, session, brandId } = await requireOnboardingBrand();
    const seed = session.seed || "";
    const url = extractUrl(seed);
    if (url) {
      const { text: corpus, assets } = await scrapeSite(url);
      await saveBrandSource(brandId, { url, assets, readChars: corpus.length });
      await upsertOnboardingSession({ userId: user.id, orgId: session.org_id, seed, data: { scrape: { url, corpus } } });
    }
    redirect("/onboarding/03");
  }

  return (
    <Step
      step={2}
      back="/onboarding/01"
      title={door === "non" ? "Ce qui existe déjà, s’il y a quelque chose" : "La matière première"}
      intro={
        door === "non"
          ? "Aucune identité à respecter : Brand OS partira de votre description. S’il existe malgré tout un logo à garder ou une contrainte imposée (mairie, fédération, franchise), déposez-le ici."
          : url
            ? "Brand OS lit la page publique du site pour en tirer ce que la marque dit, à qui, et comment. Déposez aussi le logo : c’est lui qui fixe les couleurs officielles."
            : "Aucune adresse de site détectée : l’analyse s’appuiera sur votre description et sur le logo. Vous pouvez revenir en arrière pour ajouter un site."
      }
    >
      <div className="flex items-center gap-4 rounded-inner bg-soft p-4">
        <span className="grid size-10 flex-none place-items-center rounded-pill bg-card text-ink">
          {url ? <Globe size={18} strokeWidth={1.75} /> : <TextQuote size={18} strokeWidth={1.75} />}
        </span>
        <div className="min-w-0">
          <Meta>{url ? "Site à lire" : "Votre description"}</Meta>
          <p className={`text-body text-ink ${url ? "truncate" : "line-clamp-3"}`}>{url ?? session.seed}</p>
        </div>
      </div>

      <div className="grid gap-2">
        <span className="text-small font-semibold text-ink">{door === "non" ? "Un logo à garder (facultatif)" : "Le logo"}</span>
        <LogoUploader brandId={brandId} current={session.data.logo?.url ?? null} />
        <Meta>PNG à fond transparent ou SVG de préférence. Le logo apparaît sur la planche de marque et le lien public.</Meta>
      </div>

      <form action={startScrape} className="grid">
        <SubmitButton pendingLabel={url ? "Lecture du site…" : "…"} className="justify-self-end">
          {url ? "Lire le site et continuer" : "Continuer"} <ArrowRight size={18} strokeWidth={1.75} />
        </SubmitButton>
      </form>
    </Step>
  );
}
