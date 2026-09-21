/**
 * Symbole : un cadre accroché à son clou — ce qu'on met « à la cimaise ».
 * Il ne dépend pas du nom du produit, et son cadre prend la couleur de la marque cliente active.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Brand OS">
      <rect width="32" height="32" rx="16" className="fill-ink" />
      <path d="M16 8.5 10.5 14h11Z" className="fill-none stroke-card" strokeWidth="1.5" strokeLinejoin="round" />
      <rect
        x="9.5"
        y="14"
        width="13"
        height="10"
        rx="2.5"
        className="fill-brand stroke-card transition-[fill] duration-(--duration-retint) ease-cimaise"
        strokeWidth="1.5"
      />
      <circle cx="16" cy="8" r="1.75" className="fill-card" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark />
      <span className="font-display text-h2 font-normal leading-none text-ink">Brand OS</span>
    </span>
  );
}
