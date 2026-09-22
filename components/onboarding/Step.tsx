import type { CSSProperties, ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ButtonLink, Meta } from "@/components/ui";
import { brandStyle } from "@/lib/tokens";

export const ONBOARDING_STEPS = ["Orientation", "Matière", "Analyse", "Entreprise", "Voix", "Offre et canaux", "Validation"] as const;

/**
 * Cadre commun des sept étapes. Dès que le Brand OS existe (étape 4), `brandColor`
 * reteinte l'étape : c'est le moment où l'atelier devient celui de la marque.
 * Les étapes 4 à 6 sont préremplies par l'analyse : on corrige, on ne remplit pas.
 */
export function Step({
  step,
  title,
  intro,
  back,
  backLabel = "Étape précédente",
  brandColor,
  wide = false,
  children,
}: {
  step: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  title: ReactNode;
  intro: ReactNode;
  back?: string;
  backLabel?: string;
  brandColor?: string | null;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`grid w-full grid-cols-[minmax(0,1fr)] gap-6 rounded-shell bg-shell p-4 md:p-6 ${wide ? "max-w-4xl" : "max-w-2xl"}`}
      style={brandStyle(brandColor) as CSSProperties}
    >
      <header className="flex items-center justify-between gap-4 px-2">
        <Logo />
        <Meta>
          {String(step).padStart(2, "0")} / {String(ONBOARDING_STEPS.length).padStart(2, "0")} · {ONBOARDING_STEPS[step - 1]}
        </Meta>
      </header>

      <ol aria-hidden className="flex gap-1 px-2">
        {ONBOARDING_STEPS.map((name, index) => (
          <li
            key={name}
            className={`h-1 flex-1 rounded-pill transition-colors duration-(--duration-retint) ease-cimaise ${index < step ? "bg-ink" : "bg-line"}`}
          />
        ))}
      </ol>

      <section className="grid grid-cols-[minmax(0,1fr)] gap-6 rounded-card bg-card p-6 md:p-8">
        <div className="grid gap-2">
          <h1 className="font-display text-h1 text-ink">{title}</h1>
          <p className="max-w-prose text-body text-mute">{intro}</p>
        </div>
        {children}
      </section>

      {back ? (
        <ButtonLink href={back} variant="ghost" className="justify-self-start">
          <ArrowLeft size={18} strokeWidth={1.75} /> {backLabel}
        </ButtonLink>
      ) : null}
    </div>
  );
}
