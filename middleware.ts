import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public paths
  const publicPaths = ["/login", "/auth/callback", "/"];
  if (publicPaths.includes(pathname) || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  // Heuristic: presence of Supabase auth cookies
  const cookies = req.cookies.getAll();
  const hasAuthCookie = cookies.some((c) =>
    /^(sb|supabase)[-_:.]/.test(c.name) || c.name === "supabase-auth-token"
  );

  if (!hasAuthCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/onboarding/:path*"],
};

