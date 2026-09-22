"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/app", label: "Accueil" },
  { href: "/app/marque", label: "Marque" },
  { href: "/app/studio", label: "Studio" },
  { href: "/app/calendrier", label: "Calendrier" },
  { href: "/app/expert", label: "Expert" },
  { href: "/app/equipe", label: "Équipe" },
] as const;

export function PillNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigation principale" className="flex gap-1 overflow-x-auto rounded-pill bg-soft p-1">
      {ITEMS.map(({ href, label }) => {
        const current = href === "/app" ? pathname === "/app" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className="whitespace-nowrap rounded-pill px-4 py-2 text-small text-mute transition duration-(--duration-fast) ease-cimaise hover:text-ink aria-[current=page]:bg-ink aria-[current=page]:text-card"
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
