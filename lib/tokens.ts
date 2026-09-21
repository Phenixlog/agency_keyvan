/**
 * Design tokens — direction « Cimaise » (voir DA-DECISIONS.md).
 *
 * Source de vérité. `app/globals.css` en expose le miroir à Tailwind (@theme) ;
 * `lib/tokens.test.mjs` vérifie que les deux restent identiques et que chaque
 * paire texte/fond tient le contraste AA. Module pur : aucun import local.
 */

export const T = {
  color: {
    /** Fond de page, derrière la coque de l'application. */
    scene: "#E4E0D6",
    /** La coque : le grand conteneur arrondi qui porte toute l'interface. */
    shell: "#F6F4EE",
    /** Surface des cartes. */
    card: "#FFFFFF",
    /** Surface en creux : champs, pistes de pilules, puces neutres. */
    soft: "#EDEAE2",
    /** Filets. */
    line: "#E2DED4",
    /** Encre : texte, pilule active, bouton principal. */
    ink: "#1A1815",
    /** Texte secondaire et métadonnées. */
    mute: "#69645A",
    success: "#2F6B4F",
    successTint: "#E3EFE8",
    danger: "#B3402E",
    dangerTint: "#F7E4E0",
    warning: "#7A5C14",
    warningTint: "#F5ECD2",
    /**
     * Couleur de la marque cliente quand aucune n'est active (pages publiques, login).
     * Dans l'app, `--color-brand` est remplacée par celle de la marque active.
     */
    brandDefault: "#1A1815",
  },

  /** Grille 8 px (xs = demi-pas pour les ajustements optiques). */
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64 },

  radius: {
    /** Étiquettes de version, puces mono. */
    tag: 6,
    /** Éléments imbriqués dans une carte : champs, vignettes. */
    inner: 16,
    card: 24,
    shell: 32,
    /** Pilules et boutons. */
    pill: 999,
  },

  font: {
    family: {
      /** Titres : sérif éditorial. */
      display: "Instrument Serif",
      /** Interface et texte courant. */
      text: "Instrument Sans",
      /** Métadonnées : versions, formats, dates — les « annotations d'épreuve ». */
      meta: "JetBrains Mono",
    },
    /** Page publique uniquement. */
    hero: { size: 72, weight: 400, lineHeight: 1, tracking: -0.02 },
    display: { size: 44, weight: 400, lineHeight: 1.05, tracking: -0.01 },
    h1: { size: 32, weight: 400, lineHeight: 1.1, tracking: -0.01 },
    h2: { size: 20, weight: 600, lineHeight: 1.3, tracking: -0.01 },
    title: { size: 15, weight: 600, lineHeight: 1.4, tracking: 0 },
    body: { size: 15, weight: 400, lineHeight: 1.55, tracking: 0 },
    small: { size: 13, weight: 400, lineHeight: 1.45, tracking: 0 },
    meta: { size: 12, weight: 400, lineHeight: 1.4, tracking: -0.01 },
  },

  /** Les zones se séparent par le ton des surfaces, pas par l'ombre : deux ombres seulement. */
  shadow: {
    /** Vignette survolée. */
    lift: "0 8px 24px rgba(26, 24, 21, 0.08)",
    /** Menus et fenêtres flottantes. */
    float: "0 16px 48px rgba(26, 24, 21, 0.14)",
  },

  motion: {
    fast: "150ms",
    base: "250ms",
    /** Changement de marque : l'accent se reteinte lentement, comme un éclairage. */
    retint: "400ms",
    ease: "cubic-bezier(0.2, 0, 0, 1)",
  },

  /** Dérivés de la couleur cliente (part de couleur mélangée à la surface). */
  brandMix: { tint: 12, tintStrong: 22, highlighter: 55 },
} as const;

/* ------------------------------------------------------------------ */
/* Couleur de la marque cliente                                         */
/* ------------------------------------------------------------------ */

const HEX = /^#[0-9a-f]{6}$/i;

export function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Texte posé sur un aplat de couleur cliente : encre ou blanc, celui qui contraste le plus.
 * La couleur cliente elle-même n'est JAMAIS une couleur de texte (illisible quand elle est claire).
 */
export function onBrand(brandHex: string): string {
  return contrastRatio(brandHex, T.color.ink) >= contrastRatio(brandHex, T.color.card)
    ? T.color.ink
    : T.color.card;
}

const AA = 4.5;

function darken(hex: string, part: number): string {
  const channel = (i: number) =>
    Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - part))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(1)}${channel(3)}${channel(5)}`.toUpperCase();
}

/**
 * Aplat réellement affiché pour une couleur cliente. Pour les couleurs de luminance
 * moyenne, ni l'encre ni le blanc n'atteignent AA : on fonce alors l'aplat par pas de 2 %
 * jusqu'à ce que le blanc passe. L'écart reste imperceptible (≈ 2 à 8 %).
 */
export function brandSurface(brandHex: string): string {
  let surface = brandHex.toUpperCase();
  for (let step = 0; step < 25 && contrastRatio(surface, onBrand(surface)) < AA; step++) {
    surface = darken(surface, 0.02);
  }
  return surface;
}

/** Première couleur hexadécimale exploitable d'une palette de Brand OS (« terracotta », « #C4572E »…). */
export function brandColorFromPalette(palette: readonly string[] | null | undefined): string {
  for (const entry of palette ?? []) {
    const match = entry.match(/#[0-9a-f]{6}\b/i) ?? entry.match(/#[0-9a-f]{3}\b/i);
    if (!match) continue;
    const hex = match[0];
    return hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toUpperCase()
      : hex.toUpperCase();
  }
  return T.color.brandDefault;
}

/** Variables CSS à poser sur le conteneur de l'app pour la marque active. */
export function brandStyle(brandHex: string | null | undefined): Record<string, string> {
  const brand = brandSurface(brandHex && HEX.test(brandHex) ? brandHex : T.color.brandDefault);
  return { "--color-brand": brand, "--color-on-brand": onBrand(brand) };
}
