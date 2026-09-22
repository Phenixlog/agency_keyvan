import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultOrgForUser } from "@/lib/orgs";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export async function GET(req: NextRequest) {
  // Prepare a mutable redirect response that we can update after auth succeeds.
  // We bind Supabase cookies to this response so they are written on redirect.
  const failureUrl = new URL("/login?error=callback", req.url);
  const res = NextResponse.redirect(failureUrl);
  const supabase = createSupabaseRouteClient(req, res);

  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const email = url.searchParams.get("email") || undefined;
  const typeParam = (url.searchParams.get("type") || "").toLowerCase();

  // If no recognizable auth params, go back to login with explicit error
  if (!code && !tokenHash) {
    const noCodeUrl = new URL("/login?error=nocode", req.url);
    res.headers.set("Location", noCodeUrl.toString());
    return res;
  }

  // Try modern PKCE / magic-link code exchange first
  let userId: string | null = null;
  let userEmail: string | undefined;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data?.user) {
      userId = data.user.id;
      userEmail = data.user.email ?? undefined;
    }
  } else if (tokenHash && (typeParam === "email" || typeParam === "signup" || typeParam === "magiclink" || typeParam === "invite")) {
    // Handle older confirmation links with token_hash + type=email|signup|magiclink
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: (typeParam || "email") as "email" | "signup" | "magiclink" | "invite",
      email,
    });
    if (!error) {
      const { data: who } = await supabase.auth.getUser();
      if (who?.user) {
        userId = who.user.id;
        userEmail = who.user.email ?? undefined;
      }
    }
  }
  if (!userId) {
    // Failed to establish a session — keep failure redirect
    return res;
  }

  // Ensure org + membership (idempotent)
  let orgId: string | null = null;
  try {
    orgId = await getOrCreateDefaultOrgForUser(userId, userEmail);
  } catch {
    // Non-fatal — continue
  }

  // An invited colleague arrives here from the invitation e-mail: first thing, a password of their own.
  const { data: who } = await supabase.auth.getUser();
  if (who?.user?.user_metadata?.needs_password) {
    res.headers.set("Location", new URL("/auth/mot-de-passe", req.url).toString());
    return res;
  }
  // An organisation that already has clients is a workshop to enter, not an onboarding to start.
  if (orgId) {
    const { data: brands } = await supabase.from("brands").select("id").eq("org_id", orgId).limit(1);
    if (brands?.length) {
      res.headers.set("Location", new URL("/app", req.url).toString());
      return res;
    }
  }

  // Decide where to go next:
  // - If a completed onboarding exists → app
  // - Otherwise → onboarding
  const { data: existingOb, error: obErr } = await supabase
    .from("onboarding_sessions")
    .select("id,status")
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(1);
  const latest = !obErr && existingOb && existingOb.length > 0 ? existingOb[0] : null;
  const nextPath = latest?.status === "completed" ? "/app" : "/onboarding";

  // Update redirect target on the same response so cookies are preserved
  const finalUrl = new URL(nextPath, req.url);
  res.headers.set("Location", finalUrl.toString());
  return res;
}

