import { NextResponse, type NextRequest } from "next/server";
import { OFFERED_FORMATS, type ImageFormat } from "@/lib/brand-os";
import { getMediumBrief } from "@/lib/expertise";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

/**
 * The expertise brief of a medium, for the format picker.
 * A route handler and not a server action on purpose: Next runs a client's server actions one
 * after the other, so a brief being written (≈ 30 s the first time) would hold back "Créer".
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { format?: unknown; customRatio?: unknown; customUse?: unknown; refresh?: unknown } | null;
  const requested = typeof body?.format === "string" ? body.format : "";
  const isCustom = requested === "custom";
  const format: ImageFormat = isCustom ? "custom" : (OFFERED_FORMATS as string[]).includes(requested) ? (requested as ImageFormat) : "social_square";

  const { brand, userId } = await getWorkspace();
  if (!brand) return NextResponse.json({ error: "Aucune marque active" }, { status: 409 });

  const loaded = await getMediumBrief({
    orgId: brand.org_id,
    userId,
    format,
    custom: isCustom ? { aspectRatio: String(body?.customRatio ?? ""), use: String(body?.customUse ?? "") } : null,
    refresh: body?.refresh === true,
  });
  return NextResponse.json(loaded, { headers: { "Cache-Control": "private, no-store" } });
}
