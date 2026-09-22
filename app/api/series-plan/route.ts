import { NextResponse, type NextRequest } from "next/server";
import { resolveFormat, type ImageFormat, OFFERED_FORMATS } from "@/lib/brand-os";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CAROUSEL_MAX, CAROUSEL_MIN, planCarousel, planFeed } from "@/lib/tiles";
import { getWorkspace } from "@/lib/workspace";

/** The plan of a feed of nine, or of a carousel: reviewed by the user before any image is paid for. */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { series?: unknown; theme?: unknown; subject?: unknown; slides?: unknown; format?: unknown } | null;
  const requested = typeof body?.format === "string" ? body.format : "";
  const format: ImageFormat = (OFFERED_FORMATS as string[]).includes(requested) ? (requested as ImageFormat) : "social_square";
  const { brand, os } = await getWorkspace();
  if (!brand) return NextResponse.json({ error: "Aucune marque active" }, { status: 409 });
  const spec = resolveFormat(format);
  const common = { os: os?.canon ?? null, summary: os?.summary ?? "", formatLabel: spec.label };

  if (body?.series === "carousel") {
    const subject = typeof body.subject === "string" ? body.subject.slice(0, 600) : "";
    if (!subject.trim()) return NextResponse.json({ error: "Sujet manquant" }, { status: 400 });
    const slides = Math.min(Math.max(Number(body.slides) || 5, CAROUSEL_MIN), CAROUSEL_MAX);
    return NextResponse.json(await planCarousel({ ...common, subject, slides }), { headers: { "Cache-Control": "private, no-store" } });
  }
  const theme = typeof body?.theme === "string" ? body.theme.slice(0, 600) : "";
  return NextResponse.json(await planFeed({ ...common, theme }), { headers: { "Cache-Control": "private, no-store" } });
}
