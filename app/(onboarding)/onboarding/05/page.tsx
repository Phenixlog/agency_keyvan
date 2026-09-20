import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createStubJobsAndOuts,
  getActiveOnboardingSession,
  keepOut,
} from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export default async function OB05() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const session = await getActiveOnboardingSession(user.id);
  const orgId = session?.org_id!;
  const brandId = session?.data?.brand_id as string;

  // Ensure stub jobs/outs exist
  await createStubJobsAndOuts({ orgId: orgId!, brandId, userId: user.id });
  const { data: outs } = await supabase
    .from("outs")
    .select("id, kind, payload, status")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: true });

  async function keep(formData: FormData) {
    "use server";
    const outId = String(formData.get("outId"));
    await keepOut(outId);
    redirect("/onboarding/05");
  }

  return (
    <div className="w-full max-w-xl rounded-xl bg-white p-8 shadow-sm ring-1 ring-black/5">
      <h2 className="text-2xl font-semibold text-zinc-900">
        OB-05 · Preuve créa
      </h2>
      <p className="mt-2 text-zinc-700">
        Essais Social + Print (stub). Gardez au moins une sortie.
      </p>
      <div className="mt-4 space-y-3">
        {(outs || []).map((o) => (
          <form key={o.id} action={keep} className="flex items-center gap-3">
            <div className="flex-1 rounded-md border border-zinc-200 bg-white px-3 py-2">
              <div className="text-sm font-medium text-zinc-800">{o.kind}</div>
              <div className="text-sm text-zinc-600">
                {JSON.stringify(o.payload)}
              </div>
              <div className="text-xs text-zinc-500">Statut: {o.status}</div>
            </div>
            {o.status !== "ready" ? (
              <>
                <input type="hidden" name="outId" value={o.id} />
                <button
                  type="submit"
                  className="rounded-md bg-accent px-3 py-2 text-white hover:opacity-90"
                >
                  Garder
                </button>
              </>
            ) : (
              <span className="text-emerald-700 text-sm">Conservé</span>
            )}
          </form>
        ))}
      </div>
      <div className="mt-6 flex items-center gap-3">
        <Link
          href="/onboarding/04"
          className="text-zinc-600 underline underline-offset-4"
        >
          Retour
        </Link>
        <Link
          href="/onboarding/06"
          className="ml-auto inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-white hover:opacity-90"
        >
          Suivant
        </Link>
      </div>
    </div>
  );
}

