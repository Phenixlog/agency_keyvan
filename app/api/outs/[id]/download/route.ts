import { NextResponse, type NextRequest } from "next/server";
import { outImageUrl, type OutPayload } from "@/lib/outs";
import { assertPublicUrl } from "@/lib/safe-fetch";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Sends the file with "attachment": the images live on another origin (Storage, the generator's
 * CDN), where the browser ignores <a download> and just opens a tab.
 */
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { id } = await context.params;
  // RLS: only creations of the caller's organisations are visible.
  const { data: out } = await supabase.from("outs").select("id,created_at,payload").eq("id", id).maybeSingle();
  const payload = (out?.payload ?? null) as OutPayload | null;
  const source = outImageUrl(payload);
  if (!out || !source) return NextResponse.json({ error: "Création introuvable" }, { status: 404 });

  let url: URL;
  try {
    // The address was stored by us, but it originally came from a third-party API: never fetch an internal host.
    url = assertPublicUrl(source);
  } catch {
    return NextResponse.json({ error: "Adresse d’image refusée" }, { status: 400 });
  }
  const upstream = await fetch(url, { cache: "no-store" });
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: "Image indisponible" }, { status: 502 });

  const type = upstream.headers.get("content-type") ?? "image/jpeg";
  const extension = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
  const name = `creation-${payload?.format ?? "visuel"}-${String(out.created_at).slice(0, 10)}-${String(out.id).slice(0, 8)}.${extension}`;
  return new Response(upstream.body, {
    headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" },
  });
}
