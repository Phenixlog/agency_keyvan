import { NextResponse, type NextRequest } from "next/server";
import { resolveFormat, type ImageFormat, OFFERED_FORMATS } from "@/lib/brand-os";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isTileKind, planTile, surfaceOf } from "@/lib/tiles";
import { getWorkspace } from "@/lib/workspace";

/**
 * The words of a tile, drafted in the brand's voice for the user to correct before generating.
 * A route handler (not a server action) so it never queues behind "Créer".
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { kind?: unknown; brief?: unknown; format?: unknown; customUse?: unknown; headline?: unknown } | null;
  // A headline planned by the calendar is kept as is: the writer only completes around it.
  const headline = typeof body?.headline === "string" ? body.headline.replace(/["«»]/g, "").trim().slice(0, 60) : "";
  const kind = typeof body?.kind === "string" && isTileKind(body.kind) ? body.kind : "hook_photo";
  const brief = typeof body?.brief === "string" ? body.brief.slice(0, 800) : "";
  const requested = typeof body?.format === "string" ? body.format : "";
  const format: ImageFormat = requested === "custom" ? "custom" : (OFFERED_FORMATS as string[]).includes(requested) ? (requested as ImageFormat) : "social_square";

  const { brand, os } = await getWorkspace();
  if (!brand) return NextResponse.json({ error: "Aucune marque active" }, { status: 409 });

  const spec = resolveFormat(format, format === "custom" ? { aspectRatio: "1:1", use: String(body?.customUse ?? "") } : null);
  const result = await planTile({ os: os?.canon ?? null, summary: os?.summary ?? "", kind, brief, formatLabel: spec.label, surface: surfaceOf(spec), headline });
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
