import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Step } from "@/components/onboarding/Step";
import { Meta } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { getOnboardingBrandOS, markOnboardingCompleted, requireOnboardingBrand } from "@/lib/onboarding";
import { ACTIVE_BRAND_COOKIE } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export default async function OB06() {
  const { supabase, brandId } = await requireOnboardingBrand();
  const [brand, { count }] = await Promise.all([
    getOnboardingBrandOS(brandId),
    supabase.from("outs").select("id", { count: "exact", head: true }).eq("brand_id", brandId).eq("status", "ready"),
  ]);
  const kept = count ?? 0;

  async function finish() {
    "use server";
    const { session, brandId } = await requireOnboardingBrand();
    await markOnboardingCompleted(session.id);
    // Land in the app on the brand that was just created.
    (await cookies()).set(ACTIVE_BRAND_COOKIE, brandId, { path: "/", maxAge: ONE_YEAR_SECONDS, sameSite: "lax" });
    redirect("/app");
  }

  return (
    <Step
      step={6}
      back="/onboarding/05"
      brandColor={brand.color}
      title={
        <>
          <em className="highlighter">{brand.name}</em> est à la cimaise
        </>
      }
      intro={
        kept
          ? "Le Brand OS est en place et vos premières créations sont gardées. La suite se passe dans l’atelier : créer, trier, planifier."
          : "Le Brand OS est en place. Vous n’avez gardé aucune création pour l’instant : vous pourrez en créer d’autres dans l’atelier."
      }
    >
      <form action={finish} className="flex items-center justify-between gap-4">
        <Meta>{kept} création{kept > 1 ? "s" : ""} gardée{kept > 1 ? "s" : ""}</Meta>
        <SubmitButton pendingLabel="Ouverture…">
          Entrer dans l’atelier <ArrowRight size={18} strokeWidth={1.75} />
        </SubmitButton>
      </form>
    </Step>
  );
}
