import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/jobs/engine";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { id } = await context.params;
    const job = await getJob(id);
    if (!job) {
      return NextResponse.json({ error: "Job introuvable" }, { status: 404 });
    }
    return NextResponse.json({ job });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : typeof e === "string" ? e : "Erreur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

