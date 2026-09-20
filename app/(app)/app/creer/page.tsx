import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { queueSocialGeneration } from "@/lib/jobs/engine";
import { JobProgress } from "@/components/jobs/JobProgress";

export const dynamic = "force-dynamic";

export default async function CreerPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Resolve active brand
  const cookieStore = cookies() as any;
  let brandId =
    cookieStore.get?.("active_brand")?.value ||
    (await supabase
      .from("brands")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()).data?.id ||
    "";
  const { data: brand } = await supabase
    .from("brands")
    .select("id,org_id,name")
    .eq("id", brandId || "")
    .maybeSingle();
  const orgId = brand?.org_id as string;

  async function launchGen(formData: FormData) {
    "use server";
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const brief = String(formData.get("brief") || "").slice(0, 800);
    const brandId = String(formData.get("brandId") || "");
    const { data: brand } = await supabase
      .from("brands")
      .select("id,org_id")
      .eq("id", brandId)
      .maybeSingle();
    if (!brand) {
      throw new Error("Marque introuvable.");
    }
    const { jobId } = await queueSocialGeneration({
      orgId: brand.org_id as string,
      brandId: brand.id as string,
      userId: user.id,
      brief,
    });
    redirect(`/app/creer?job=${jobId}&brand=${brand.id}`);
  }

  // NB: progression visible via composant client JobProgress (querystring ?job=)

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5">
      <h2 className="text-xl font-semibold text-zinc-900">Créer</h2>
      {!brand ? (
        <p className="mt-2 text-zinc-700">Aucune marque active.</p>
      ) : (
        <>
          <form action={launchGen} className="mt-4 space-y-4">
            <input type="hidden" name="brandId" value={brand.id} />
            <div>
              <label className="block text-sm font-medium text-zinc-800">
                Type
              </label>
              <select
                name="type"
                defaultValue="social"
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent md:w-64"
              >
                <option value="social">Social (1:1)</option>
                <option value="print" disabled>
                  Print (bientôt)
                </option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-800">
                Brief (optionnel)
              </label>
              <textarea
                name="brief"
                rows={3}
                placeholder="Contexte/objectif du post…"
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-white hover:opacity-90"
            >
              Lancer la génération
            </button>
          </form>
          {/* Progression du job */}
          <JobProgress />
        </>
      )}
    </div>
  );
}

