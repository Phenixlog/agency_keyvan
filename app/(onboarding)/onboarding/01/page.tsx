import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createDraftBrand,
  extractUrl,
  getActiveOnboardingSession,
  upsertOnboardingSession,
} from "@/lib/onboarding";
import { getOrCreateDefaultOrgForUser } from "@/lib/orgs";

export const dynamic = "force-dynamic";

export default async function OB01() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  async function start(formData: FormData) {
    "use server";
    const seed = String(formData.get("seed") || "").trim();
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const orgId = await getOrCreateDefaultOrgForUser(user.id, user.email || undefined);
    // Create draft brand if none in session
    const existing = await getActiveOnboardingSession(user.id);
    let brandId = existing?.data?.brand_id as string | undefined;
    if (!brandId && orgId) {
      const url = extractUrl(seed);
      const brand = await createDraftBrand({
        orgId,
        userId: user.id,
        seed,
        url,
      });
      brandId = brand.id;
    }
    await upsertOnboardingSession({
      userId: user.id,
      orgId: orgId ?? null,
      seed,
      brandId: brandId!,
    });
    redirect("/onboarding/02");
  }

  return (
    <div className="w-full max-w-xl rounded-xl bg-white p-8 shadow-sm ring-1 ring-black/5">
      <h2 className="text-2xl font-semibold text-zinc-900">OB-01 · Sources</h2>
      <p className="mt-2 text-zinc-700">
        Fournissez une URL ou un texte de départ (si non saisi sur la page
        précédente).
      </p>
      <form action={start}>
        <input
          name="seed"
          className="mt-4 w-full rounded-md border border-zinc-300 px-3 py-2 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="https://votre-marque.com ou description NL"
          required
        />
        <div className="mt-6 flex items-center gap-3">
          <Link
            href="/onboarding"
            className="text-zinc-600 underline underline-offset-4"
          >
            Retour
          </Link>
          <button
            type="submit"
            className="ml-auto inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-white hover:opacity-90"
          >
            Suivant
          </button>
        </div>
      </form>
    </div>
  );
}

