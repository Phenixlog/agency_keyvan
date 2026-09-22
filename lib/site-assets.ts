/**
 * Ce qu'un site dit de lui-même : son logo (une <img> déclarée comme telle, sinon la meilleure icône
 * du <head>), son image de partage et son nom. Module pur : il lit du HTML, il ne va rien chercher.
 * Les adresses viennent d'une page tierce : elles sont résolues, limitées à http(s) et validées
 * par l'appelant (assertPublicUrl) avant d'être stockées.
 */

export type SiteAssets = { logo: string | null; image: string | null; siteName: string | null; colors?: string[] };

const MAX_HEAD_CHARS = 200_000;
const MAX_NAME = 80;

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([a-z][a-z0-9:_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
    result[match[1].toLowerCase()] = (match[2] ?? match[3] ?? match[4] ?? "").trim();
  }
  return result;
}

function decode(text: string): string {
  return text.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function resolve(href: string | undefined, base: string): string | null {
  if (!href || href.startsWith("data:")) return null;
  try {
    const url = new URL(decode(href), base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Largest declared size first: "180x180" beats "32x32"; an icon without sizes counts as small. A logo declared on the page outranks every icon. */
function iconSize(sizes: string | undefined): number {
  const match = sizes?.match(/(\d+)\s*x\s*(\d+)/i);
  return match ? Number(match[1]) : 0;
}

export function extractSiteAssets(html: string, pageUrl: string): SiteAssets {
  const head = html.slice(0, MAX_HEAD_CHARS);
  const icons: { url: string; rank: number }[] = [];
  let image: string | null = null;
  let siteName: string | null = null;

  // The real logo, when the page declares it: <img itemprop="logo">, or an <img> in the header whose
  // class, id or alt says "logo". A favicon of 32 px is never a logo when one of these exists.
  const body = html.slice(0, MAX_HEAD_CHARS * 2);
  for (const [tag] of body.matchAll(/<img\b[^>]*>/gi)) {
    const attr = attributes(tag);
    const hint = `${attr.itemprop ?? ""} ${attr.class ?? ""} ${attr.id ?? ""} ${attr.alt ?? ""}`.toLowerCase();
    if (!/\blogo\b/.test(hint)) continue;
    const url = resolve(attr.src ?? attr["data-src"], pageUrl);
    if (!url) continue;
    icons.push({ url, rank: (attr.itemprop ?? "").toLowerCase() === "logo" ? 5000 : 3000 });
    if (icons.length >= 4) break;
  }

  for (const [tag] of head.matchAll(/<(?:link|meta)\b[^>]*>/gi)) {
    const attr = attributes(tag);
    if (/^<link/i.test(tag)) {
      const rel = (attr.rel ?? "").toLowerCase();
      if (!/\bicon\b/.test(rel)) continue;
      const url = resolve(attr.href, pageUrl);
      if (!url) continue;
      // apple-touch-icon is a full-bleed 180 px mark; SVG scales; a bare favicon is the last resort.
      const bonus = rel.includes("apple-touch-icon") ? 1000 : /\.svg(\?|$)/i.test(url) ? 500 : 0;
      icons.push({ url, rank: bonus + iconSize(attr.sizes) });
    } else {
      const key = (attr.property ?? attr.name ?? "").toLowerCase();
      if (!image && (key === "og:image" || key === "og:image:secure_url" || key === "twitter:image")) image = resolve(attr.content, pageUrl);
      if (!siteName && key === "og:site_name" && attr.content) siteName = decode(attr.content).slice(0, MAX_NAME);
    }
  }

  if (!siteName) {
    const title = head.match(/<title[^>]*>([^<]{1,300})<\/title>/i)?.[1];
    // "Atelier Lune — Céramique faite main" → the part before the separator is usually the name.
    if (title) siteName = decode(title).split(/\s+[|–—·-]\s+/)[0].trim().slice(0, MAX_NAME) || null;
  }

  icons.sort((a, b) => b.rank - a.rank);
  return { logo: icons[0]?.url ?? null, image, siteName };
}

const MAX_COLORS = 5;
/** A colour is "grey" when its channels are within this distance of each other: theme greys are noise, not identity. */
const GREY_TOLERANCE = 24;

/**
 * The colours the site actually uses: hex codes counted in its HTML and inline CSS (theme variables,
 * inline styles), most frequent first, greys dropped, black and white kept only when nothing else
 * remains. Facts for the analysis, which must not invent a palette from words.
 */
export function extractSiteColors(html: string): string[] {
  const counts = new Map<string, number>();
  for (const match of html.matchAll(/#([0-9a-f]{6})\b/gi)) {
    const hex = `#${match[1].toUpperCase()}`;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  const isGrey = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return Math.max(r, g, b) - Math.min(r, g, b) <= GREY_TOLERANCE;
  };
  const ranked = Array.from(counts).sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
  const colourful = ranked.filter((hex) => !isGrey(hex));
  const extremes = ranked.filter((hex) => hex === "#000000" || hex === "#FFFFFF");
  return [...colourful.slice(0, MAX_COLORS), ...extremes].slice(0, MAX_COLORS);
}
