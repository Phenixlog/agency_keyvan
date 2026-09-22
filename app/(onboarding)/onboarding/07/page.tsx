import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, CircleAlert, PenLine, Sparkles } from "lucide-react";
import { BrandBoard } from "@/components/brand/BrandBoard";
import { Step } from "@/components/onboarding/Step";
import { Meta, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { loadBoard } from "@/lib/brand-board";
import { getOnboardingBrandOS, requireOnboardingBrand, validateBrand } from "@/lib/onboarding";
import { readiness } from "@/lib/onboarding-answers";
import { ACTIVE_BRAND_COOKIE } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export default async function OB07() {
  const { supabase, session, brandId } = await requireOnboardingBrand();
  const [brand, board] = await Promise.all([getOnboardingBrandOS(brandId), loadBoard(supabase, brandId)]);
  if (!brand.canon || !board) redirect("/onboarding/03");
  const blocks = readiness(brand.canon);
  const missing = blocks.filter((b) => !b.ok);
  const door = session.data.door ?? "oui";

  async function validate() {
    "use server";
    const { session, brandId } = await requireOnboardingBrand();
    await validateBrand({ brandId, sessionId: session.id });
    // Land in the app on the brand that was just validated.
    (await cookies()).set(ACTIVE_BRAND_COOKIE, brandId, { path: "/", maxAge: ONE_YEAR_SECONDS, sameSite: "lax" });
    redirect("/app?ok=valide");
  }

  return (
    <Step
      step={7}
      wide
      back="/onboarding/06"
      brandColor={brand.color}
      title={
        <>
          La fiche de <em className="highlighter">{brand.name}</em>
        </>
      }
      intro="La question qui compte : un associé peut-il pitcher cette marque en 60 secondes avec cette fiche seule ? Si oui, validez. Studio et Calendrier s’ouvrent à ce moment-là, pas avant."
    >
      <section aria-label="Ce qui est prêt" className="grid gap-2 md:grid-cols-2">
        {blocks.map((block) => (
          <div key={block.key} className={`flex items-start gap-3 rounded-inner px-4 py-3 ${block.ok ? "bg-success-tint" : "bg-warning-tint"}`}>
            <span className={`mt-0.5 flex-none ${block.ok ? "text-success" : "text-warning"}`}>
              {block.ok ? <Check size={16} strokeWidth={2} /> : <CircleAlert size={16} strokeWidth={2} />}
            </span>
            <span className="grid min-w-0 gap-0.5">
              <span className={`text-small font-semibold ${block.ok ? "text-success" : "text-warning"}`}>{block.label}</span>
              {!block.ok ? (
                <Link href={`/onboarding/0${block.step}`} className="inline-flex items-center gap-1 font-mono text-meta text-warning underline underline-offset-4">
                  <PenLine size={12} strokeWidth={1.75} /> {block.hint}
                </Link>
              ) : null}
            </span>
          </div>
        ))}
      </section>

      {door === "non" ? (
        <Notice tone="warning">
          Identité visuelle à créer : la prochaine version du produit proposera trois directions (palette, polices, logo, moodboard). En attendant, la direction visuelle notée à l’étape précédente guide les images.
        </Notice>
      ) : null}

      <div className="-mx-6 md:-mx-8">
        <div className="bg-shell p-4 md:p-6">
          <BrandBoard board={board} />
        </div>
      </div>

      <form action={validate} className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
        <Meta>
          {missing.length ? `${missing.length} bloc${missing.length > 1 ? "s" : ""} à compléter — vous pouvez valider quand même, l’expert aidera ensuite.` : "Tous les blocs sont remplis."}
        </Meta>
        <SubmitButton pendingLabel="Validation…">
          <Sparkles size={18} strokeWidth={1.75} /> Valider le Brand OS
        </SubmitButton>
      </form>
    </Step>
  );
}
