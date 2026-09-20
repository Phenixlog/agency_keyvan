import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/jobs/engine";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const job = await getJob(params.id);
    if (!job) {
      return NextResponse.json({ error: "Job introuvable" }, { status: 404 });
    }
    return NextResponse.json({ job });
  } catch (e: any) {
    const message =
      e instanceof Error ? e.message : typeof e === "string" ? e : "Erreur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

