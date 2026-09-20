import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OnboardingIndex() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="w-full max-w-xl rounded-xl bg-white p-8 shadow-sm ring-1 ring-black/5">
      <h2 className="text-2xl font-semibold text-zinc-900">
        Onboarding · Étape 1
      </h2>
      <p className="mt-2 text-zinc-700">
        Démarrons avec quelques informations pour configurer votre Marque OS.
      </p>
      <div className="mt-6">
        <Link
          href="/onboarding/01"
          className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-white hover:opacity-90"
        >
          Continuer
        </Link>
      </div>
    </div>
  );
}

