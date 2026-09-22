import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Step } from "@/components/onboarding/Step";
import { Meta, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { isLlmConfigured } from "@/lib/llm/openrouter";
import { logoDeclaration, readLogo } from "@/lib/logo-read";
import { ensureDraftOSAndMega, requireOnboardingBrand, siteColorsOf } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

const WHAT_WE_EXTRACT = [
  ["Positionnement et promesse", "pour qui, quoi, en quoi c’est différent"],
  ["Entreprise et offre", "ce qu’elle vend, les bénéfices, l’objectif à 90 jours"],
  ["Publics", "jusqu’à trois : qui, désir, objection, preuve"],
  ["Voix", "ton, curseurs, mots imposés et interdits, tutoiement"],
  ["Direction visuelle", "palette codée (lue sur le site et sur le logo), style d’image, ambiance, interdits"],
  ["Offres, preuves, canaux", "ce qu’on peut affirmer, et où le dire"],
] as const;

const DOOR_LINE = { oui: "identité existante à respecter", logo: "logo seul, règles à construire", non: "identité à créer" } as const;

export default async function OB03() {
  const { session } = await requireOnboardingBrand();
  const corpus = session.data.scrape?.corpus || "";
  const door = session.data.door ?? "oui";

  async function generate() {
    "use server";
    const { user, session, orgId, brandId } = await requireOnboardingBrand();
    const source = [session.seed, session.data.scrape?.corpus].filter(Boolean).join("\n\n");
    const door = session.data.door ?? "oui";
    const siteColors = await siteColorsOf(brandId);
    // The logo is looked at, not just mentioned: for a brand with nothing else, it IS the identity.
    const logo = session.data.logo?.url ? await readLogo(session.data.logo.url) : null;
    const declared = [
      session.data.internal_name ? `Nom du client : ${session.data.internal_name}` : "",
      siteColors.length ? `Couleurs réellement utilisées par le site (lues dans son CSS, par fréquence) : ${siteColors.join(", ")}. La palette DOIT reprendre ces codes tels quels (nomme-les), sans en inventer d'autres.` : "",
      session.data.display_name ? `Nom commercial : ${session.data.display_name}` : "",
      `Identité visuelle : ${DOOR_LINE[door]}`,
      session.data.logo ? "Un logo a été déposé." : "",
      logoDeclaration(logo),
    ]
      .filter(Boolean)
      .join("\n");
    await ensureDraftOSAndMega({ orgId, brandId, userId: user.id, corpusOrSeed: source, declared, door });
    redirect("/onboarding/04");
  }

  return (
    <Step
      step={3}
      back="/onboarding/02"
      title="Brand OS comprend l’entreprise"
      intro="À partir de la matière collectée, il préremplit toute la fiche de la marque. Comptez trente secondes à une minute. Ensuite, vous corrigez : c’est tout."
    >
      {session.data.scrape && !corpus ? (
        <Notice tone="warning">Le site n’a pas pu être lu (page protégée, inaccessible ou vide). L’analyse s’appuiera sur votre description.</Notice>
      ) : null}
      {!isLlmConfigured() ? (
        <Notice tone="warning">Analyse IA non configurée sur ce serveur : vous obtiendrez un brouillon à compléter à la main aux étapes suivantes.</Notice>
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
        <Meta>
          {corpus ? `${corpus.length.toLocaleString("fr-FR")} caractères lus sur le site` : "description seule"} · {DOOR_LINE[door]}
        </Meta>
        <SubmitButton pendingLabel="Analyse en cours… (≈ 45 s)">
          Analyser <ArrowRight size={18} strokeWidth={1.75} />
        </SubmitButton>
      </form>
    </Step>
  );
}
