import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Step } from "@/components/onboarding/Step";
import { Meta, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { isLlmConfigured } from "@/lib/llm/openrouter";
import { ensureDraftOSAndMega, requireOnboardingBrand } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

const WHAT_WE_EXTRACT = [
  ["Positionnement", "pour qui, quoi, et en quoi c’est différent"],
  ["Cible et promesse", "à qui parle la marque, et ce qu’elle promet"],
  ["Ton de voix", "les adjectifs qui la caractérisent"],
  ["Direction visuelle", "palette, style d’image, ambiance, interdits"],
] as const;

export default async function OB03() {
  const { session } = await requireOnboardingBrand();
  const corpus = (session.data?.scrape?.corpus as string | undefined) || "";

  async function generate() {
    "use server";
    const { user, session, orgId, brandId } = await requireOnboardingBrand();
    const source = [session.seed, session.data?.scrape?.corpus].filter(Boolean).join("\n\n");
    await ensureDraftOSAndMega({ orgId, brandId, userId: user.id, corpusOrSeed: source });
    redirect("/onboarding/04");
  }

  return (
    <Step
      step={3}
      back="/onboarding/02"
      title="On construit le Brand OS"
      intro="À partir de la matière collectée, Brand OS rédige la fiche d’identité de la marque. Comptez une vingtaine de secondes."
    >
      {session.data?.scrape && !corpus ? (
        <Notice tone="warning">
          Le site n’a pas pu être lu (page protégée, inaccessible ou vide). L’analyse s’appuiera sur votre description.
        </Notice>
      ) : null}
      {!isLlmConfigured() ? (
        <Notice tone="warning">
          Analyse IA non configurée sur ce serveur : vous obtiendrez un brouillon à compléter à la main à l’étape suivante.
        </Notice>
      ) : null}
      <dl className="grid gap-x-8 md:grid-cols-2">
        {WHAT_WE_EXTRACT.map(([term, detail]) => (
          <div key={term} className="border-t border-line py-4">
            <dt className="text-title text-ink">{term}</dt>
            <dd className="text-small text-mute">{detail}</dd>
          </div>
        ))}
      </dl>
      <form action={generate} className="flex items-center justify-between gap-4">
        <Meta>{corpus ? `${corpus.length.toLocaleString("fr-FR")} caractères lus sur le site` : "description seule"}</Meta>
        <SubmitButton pendingLabel="Analyse en cours…">
          Analyser la marque <ArrowRight size={18} strokeWidth={1.75} />
        </SubmitButton>
      </form>
    </Step>
  );
}
