import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrCreateDefaultOrgForUser } from "@/lib/orgs";

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient();

  // Exchange the code for a session (magic link or PKCE)
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/login?error=nocode", req.url));
  }
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // Failed to exchange — back to login
    return NextResponse.redirect(new URL("/login?error=callback", req.url));
  }

  const user = data.user;
  if (!user) {
    return NextResponse.redirect(new URL("/login?error=nouser", req.url));
  }

  // Ensure org + membership (idempotent)
  try {
    await getOrCreateDefaultOrgForUser(user.id, user.email ?? undefined);
  } catch {
    // Non-fatal — continue
  }

  // If an onboarding in progress exists, continue it; else start onboarding.
  const { data: existingOb, error: obErr } = await supabase
    .from("onboarding_sessions")
    .select("id,status,data")
    .eq("created_by", user.id)
    .in("status", ["draft", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1);
  const hasProgress = !obErr && existingOb && existingOb.length > 0;
  const nextUrl = hasProgress ? "/onboarding" : "/onboarding";

  return NextResponse.redirect(new URL(nextUrl, req.url));
}

