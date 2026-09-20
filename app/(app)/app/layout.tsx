import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: brands } = await supabase
    .from("brands")
    .select("id,name")
    .order("created_at", { ascending: true });
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/app" className="font-semibold text-zinc-900">
            Brand OS
          </Link>
          <nav className="flex items-center gap-5 text-zinc-700">
            <Link href="/app/marque" className="hover:text-accent">
              Marque
            </Link>
            <Link href="/app/creer" className="hover:text-accent">
              Créer
            </Link>
            <Link href="/app/studio" className="hover:text-accent">
              Studio
            </Link>
            <Link href="/app/calendrier" className="hover:text-accent">
              Calendrier
            </Link>
            <Link href="/app/expert" className="hover:text-accent">
              Expert
            </Link>
          </nav>
          <div>
            <form
              action="/app/marque"
              className="flex items-center gap-2"
              method="get"
            >
              {brands && brands.length > 0 ? (
                <>
                  <label className="text-sm text-zinc-700">Marque:</label>
                  <select
                    name="brand"
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    defaultValue={brands[0]?.id}
                  >
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:border-accent"
                  >
                    Ouvrir
                  </button>
                </>
              ) : (
                <span className="text-sm text-zinc-600">Aucune marque</span>
              )}
              {user ? (
                <a
                  href="/logout"
                  className="ml-3 text-sm text-zinc-700 underline underline-offset-4"
                >
                  Déconnexion
                </a>
              ) : null}
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

