/**
 * Ce qu'un site dit de lui-même dans son <head> : son icône (le plus proche d'un logo), son image
 * de partage et son nom. Module pur : il lit du HTML, il ne va rien chercher.
 * Les adresses viennent d'une page tierce : elles sont résolues, limitées à http(s) et validées
 * par l'appelant (assertPublicUrl) avant d'être stockées.
 */

export type SiteAssets = { logo: string | null; image: string | null; siteName: string | null };

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

/** Largest declared size first: "180x180" beats "32x32"; an icon without sizes counts as small. */
function iconSize(sizes: string | undefined): number {
  const match = sizes?.match(/(\d+)\s*x\s*(\d+)/i);
  return match ? Number(match[1]) : 0;
}

export function extractSiteAssets(html: string, pageUrl: string): SiteAssets {
  const head = html.slice(0, MAX_HEAD_CHARS);
  const icons: { url: string; rank: number }[] = [];
  let image: string | null = null;
  let siteName: string | null = null;

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
