import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getActiveOnboardingSession,
  scrapeUrl,
  upsertOnboardingSession,
  extractUrl,
} from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export default async function OB02() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const session = await getActiveOnboardingSession(user.id);
  const seed = session?.seed || "";
  const maybeUrl = extractUrl(seed);

  async function startScrape() {
    "use server";
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const ob = await getActiveOnboardingSession(user.id);
    const seed = ob?.seed || "";
    const url = extractUrl(seed);
    if (url) {
      const corpus = await scrapeUrl(url);
      await upsertOnboardingSession({
        userId: user.id,
        orgId: ob?.org_id ?? null,
        seed,
        brandId: ob?.data?.brand_id,
        scrape: { url, corpus },
      });
    }
    redirect("/onboarding/03");
  }

  return (
    <div className="w-full max-w-xl rounded-xl bg-white p-8 shadow-sm ring-1 ring-black/5">
      <h2 className="text-2xl font-semibold text-zinc-900">OB-02 · Cibles</h2>
      <p className="mt-2 text-zinc-700">
        Nous analysons votre source pour bâtir un premier Brand OS.{" "}
        {maybeUrl ? (
          <span className="text-zinc-600">Source détectée: {maybeUrl}</span>
        ) : (
          <span className="text-zinc-600">
            Pas d’URL détectée, nous utiliserons uniquement votre texte.
          </span>
        )}
      </p>
      <form action={startScrape} className="mt-6 flex items-center gap-3">
        <Link
          href="/onboarding/01"
          className="text-zinc-600 underline underline-offset-4"
        >
          Retour
        </Link>
        <button
          type="submit"
          className="ml-auto inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-white hover:opacity-90"
        >
          Lancer la lecture
        </button>
      </form>
    </div>
  );
}

