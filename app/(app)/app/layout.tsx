import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ChevronsUpDown, LogOut } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { PillNav } from "@/components/app/PillNav";
import { getWorkspace } from "@/lib/workspace";
import { brandStyle } from "@/lib/tokens";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { brands, brand, brandColor } = await getWorkspace();

  return (
    // The client brand colour is scoped here: everything inside retints, the scene does not.
    <div className="min-h-screen p-4 md:p-8" style={brandStyle(brandColor) as CSSProperties}>
      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-6 rounded-shell bg-shell p-4 md:p-6">
        <header className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-card p-2 pl-4 lg:flex-nowrap lg:gap-4 lg:rounded-pill">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/app/clients" aria-label="Mes clients" className="flex-none">
              <Logo />
            </Link>
            {/* The client you are in, always visible; one click to see them all. Scales past a handful of clients, unlike pills. */}
            {brand ? (
              <Link
                href="/app/clients"
                title="Changer de client"
                className="flex min-w-0 items-center gap-2 rounded-pill bg-soft py-2 pl-2 pr-3 text-small text-ink transition duration-(--duration-fast) ease-cimaise hover:bg-line"
              >
                <span aria-hidden className="size-5 flex-none rounded-pill bg-brand transition-colors duration-(--duration-retint) ease-cimaise" />
                <span className="truncate font-semibold">{brand.name}</span>
                {brands.length > 1 ? <span className="font-mono text-meta text-mute">1/{brands.length}</span> : null}
                <ChevronsUpDown size={14} strokeWidth={1.75} className="flex-none text-mute" />
              </Link>
            ) : null}
          </div>
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

        <main className="grid min-w-0 gap-6">{children}</main>
      </div>
    </div>
  );
}
