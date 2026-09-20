"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";

type Brand = { id: string; name: string };

export function BrandSwitcher(props: {
  brands: Brand[];
  activeBrand?: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const { brands, activeBrand, action } = props;
  const pathname = usePathname();

  // Only preserve the high-level route among Marque/Créer/Studio
  const basePath = useMemo(() => {
    if (!pathname) return "/app/marque";
    if (pathname.startsWith("/app/creer")) return "/app/creer";
    if (pathname.startsWith("/app/studio")) return "/app/studio";
    if (pathname.startsWith("/app/marque")) return "/app/marque";
    return "/app/marque";
  }, [pathname]);

  if (!brands || brands.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-600">Aucune marque</span>
        <a
          href="/onboarding"
          className="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:opacity-90"
        >
          Démarrer l’onboarding
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <label className="text-sm text-zinc-700">Marque:</label>
      <input type="hidden" name="next" value={basePath} />
      <select
        name="brand"
        className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        defaultValue={activeBrand}
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
    </form>
  );
}

