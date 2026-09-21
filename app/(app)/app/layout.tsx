import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { PillNav } from "@/components/app/PillNav";
import { ACTIVE_BRAND_COOKIE, getWorkspace } from "@/lib/workspace";
import { brandStyle } from "@/lib/tokens";

export const dynamic = "force-dynamic";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { brands, brand, brandColor } = await getWorkspace();

  // Setting a cookie in a server action re-renders the current route: no redirect needed.
  async function setBrand(formData: FormData) {
    "use server";
    const id = String(formData.get("brand") || "");
    if (!id) return;
    (await cookies()).set(ACTIVE_BRAND_COOKIE, id, { path: "/", maxAge: ONE_YEAR_SECONDS, sameSite: "lax" });
  }

  return (
    // The client brand colour is scoped here: everything inside retints, the scene does not.
    <div className="min-h-screen p-4 md:p-8" style={brandStyle(brandColor) as CSSProperties}>
      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-6 rounded-shell bg-shell p-4 md:p-6">
        <header className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-card p-2 pl-4 lg:flex-nowrap lg:gap-4 lg:rounded-pill">
          <Link href="/app" aria-label="Accueil">
            <Logo />
          </Link>
          <div className="order-last w-full min-w-0 lg:order-none lg:w-auto">
            <PillNav />
          </div>
          <a
            href="/logout"
            aria-label="Déconnexion"
            title="Déconnexion"
            className="grid size-10 place-items-center rounded-pill bg-soft text-ink transition duration-(--duration-fast) ease-cimaise hover:bg-ink hover:text-card"
          >
            <LogOut size={18} strokeWidth={1.75} />
          </a>
        </header>

        {brands.length > 1 ? (
          <form action={setBrand} aria-label="Marque active" className="flex gap-1 self-start overflow-x-auto rounded-pill bg-card p-1">
            {brands.map((b) => (
              <button
                key={b.id}
                name="brand"
                value={b.id}
                aria-pressed={b.id === brand?.id}
                className="whitespace-nowrap rounded-pill px-4 py-2 text-small text-mute transition duration-(--duration-fast) ease-cimaise hover:text-ink aria-pressed:bg-soft aria-pressed:font-semibold aria-pressed:text-ink"
              >
                {b.name}
              </button>
            ))}
          </form>
        ) : null}

        <main className="grid min-w-0 gap-6">{children}</main>
      </div>
    </div>
  );
}
