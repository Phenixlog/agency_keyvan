import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Create a Supabase client for Next.js Route Handlers.
 * Binds cookie get/set/remove to the provided NextResponse so that
 * auth cookies are written on the actual redirect/response.
 */
export function createSupabaseRouteClient(req: NextRequest, res: NextResponse) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return req.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: any) {
        try {
          res.cookies.set({ name, value, ...options });
        } catch {
          // ignore
        }
      },
      remove(name: string, options: any) {
        try {
          // NextResponse cookies API does not have remove; emulate with maxAge 0
          res.cookies.set({ name, value: "", ...options, maxAge: 0 });
        } catch {
          // ignore
        }
      },
    },
  });
}

