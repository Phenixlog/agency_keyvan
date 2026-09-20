import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BrandSwitcher } from "@/components/BrandSwitcher";

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
  const cookieStore = cookies() as any;
  const activeBrand = cookieStore.get?.("active_brand")?.value || brands?.[0]?.id;

  async function setBrand(formData: FormData) {
    "use server";
    const id = String(formData.get("brand") || "");
    const next = String(formData.get("next") || "");
    const allowed = new Set<string>(["/app/marque", "/app/creer", "/app/studio"]);
    const store = cookies() as any;
    store.set?.("active_brand", id, { path: "/", maxAge: 60 * 60 * 24 * 365 });
    const dest = allowed.has(next) ? `${next}?brand=${id}` : `/app/marque?brand=${id}`;
    redirect(dest);
  }
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
            <div className="flex items-center">
              <BrandSwitcher brands={brands || []} activeBrand={activeBrand} action={setBrand} />
              {user ? (
                <a
                  href="/logout"
                  className="ml-3 text-sm text-zinc-700 underline underline-offset-4"
                >
                  Déconnexion
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

