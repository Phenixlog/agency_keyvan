import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <main className="flex flex-1 w-full items-center justify-center py-24 px-6">
      <div className="w-full max-w-3xl rounded-2xl bg-white/70 p-8 shadow-sm ring-1 ring-black/5">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          Brand OS — Démarrage
        </h1>
        <p className="mt-2 text-zinc-700">
          Self-serve Brand OS pour SaaS Lab. UI claire, native-like. Moteur:
          Brand OS + mega-prompt + gen V2 + NL→mega bump learning.
        </p>
        {user ? (
          <div className="mt-6 flex items-center gap-3">
            <Link
              href="/onboarding"
              className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-white hover:opacity-90"
            >
              Continuer l’onboarding
            </Link>
            <Link
              href="/app"
              className="text-accent underline underline-offset-4"
            >
              Accéder à l’app
            </Link>
          </div>
        ) : (
          <div className="mt-6 flex items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-white hover:opacity-90"
            >
              Se connecter
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
