import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOnboardingSession, markOnboardingCompleted } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export default async function OB06() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const session = await getActiveOnboardingSession(user.id);
  const brandId = session?.data?.brand_id as string;
  const { data: outsReady } = await supabase
    .from("outs")
    .select("id")
    .eq("brand_id", brandId)
    .eq("status", "ready");
  const canProceed = (outsReady?.length || 0) > 0;

  async function finish() {
    "use server";
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const session = await getActiveOnboardingSession(user.id);
    if (session) {
      await markOnboardingCompleted(session.id);
    }
    const brandId = session?.data?.brand_id as string | undefined;
    redirect(brandId ? `/app/marque?brand=${brandId}` : "/app/marque");
  }

  return (
    <div className="w-full max-w-xl rounded-xl bg-white p-8 shadow-sm ring-1 ring-black/5">
      <h2 className="text-2xl font-semibold text-zinc-900">
        OB-06 · Entrée BO
      </h2>
      <p className="mt-2 text-zinc-700">
        {canProceed
          ? "Au moins une sortie a été conservée. Prêt à entrer dans l’app."
          : "Vous pouvez continuer quand même ou conserver une sortie."}
      </p>
      <form action={finish} className="mt-6 flex items-center gap-3">
        <Link
          href="/onboarding/05"
          className="text-zinc-600 underline underline-offset-4"
        >
          Retour
        </Link>
        <button
          type="submit"
          className="ml-auto inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-white hover:opacity-90"
        >
          Entrer dans l’app
        </button>
      </form>
    </div>
  );
}

