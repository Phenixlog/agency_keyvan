import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOnboardingSession, updateOSAndMega } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export default async function OB04() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const session = await getActiveOnboardingSession(user.id);
  const brandId = session?.data?.brand_id as string;
  const { data: osV1 } = await supabase
    .from("brand_os_versions")
    .select("summary")
    .eq("brand_id", brandId)
    .eq("version", 1)
    .maybeSingle();
  const initialSummary = (osV1?.summary as string) || "";

  async function save(formData: FormData) {
    "use server";
    const summary = String(formData.get("summary") || "").trim();
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const session = await getActiveOnboardingSession(user.id);
    const brandId = session?.data?.brand_id as string;
    await updateOSAndMega({ brandId, summary });
    redirect("/onboarding/05");
  }

  return (
    <div className="w-full max-w-xl rounded-xl bg-white p-8 shadow-sm ring-1 ring-black/5">
      <h2 className="text-2xl font-semibold text-zinc-900">
        OB-04 · Confirmation douce
      </h2>
      <p className="mt-2 text-zinc-700">
        Confirmez ou éditez les bullets de votre Brand OS.
      </p>
      <form action={save}>
        <textarea
          name="summary"
          className="mt-4 w-full rounded-md border border-zinc-300 px-3 py-2 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          rows={6}
          defaultValue={initialSummary}
        />
        <div className="mt-6 flex items-center gap-3">
          <Link
            href="/onboarding/03"
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

