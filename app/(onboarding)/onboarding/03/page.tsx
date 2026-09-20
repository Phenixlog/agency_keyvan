import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ensureDraftOSAndMega,
  getActiveOnboardingSession,
} from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export default async function OB03() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const session = await getActiveOnboardingSession(user.id);

  async function generate() {
    "use server";
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const session = await getActiveOnboardingSession(user.id);
    const orgId = session?.org_id!;
    const brandId = session?.data?.brand_id as string;
    const source =
      (session?.data?.scrape?.corpus as string | undefined) ||
      (session?.seed as string | undefined) ||
      "";
    await ensureDraftOSAndMega({
      orgId: orgId!,
      brandId,
      userId: user.id,
      corpusOrSeed: source,
    });
    redirect("/onboarding/04");
  }

  return (
    <div className="w-full max-w-xl rounded-xl bg-white p-8 shadow-sm ring-1 ring-black/5">
      <h2 className="text-2xl font-semibold text-zinc-900">OB-03 · Synthèse</h2>
      <p className="mt-2 text-zinc-700">
        Génération d’un premier Brand OS (brouillon) — bullets et amorce
        méga‑prompt.
      </p>
      <form action={generate} className="mt-6 flex items-center gap-3">
        <Link
          href="/onboarding/02"
          className="text-zinc-600 underline underline-offset-4"
        >
          Retour
        </Link>
        <button
          type="submit"
          className="ml-auto inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-white hover:opacity-90"
        >
          Générer
        </button>
      </form>
    </div>
  );
}

