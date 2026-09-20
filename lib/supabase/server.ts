import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function createSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        try {
          // In Next 15/16, cookies() may be sync or async-thenable; cast for compatibility.
          const store = cookies() as any;
          return store.get?.(name)?.value;
        } catch {
          return undefined;
        }
      },
      set(name: string, value: string, options: any) {
        try {
          const store = cookies() as any;
          store.set?.({ name, value, ...options });
        } catch {
          // ignored in edge/runtime restrictions
        }
      },
      remove(name: string, options: any) {
        try {
          const store = cookies() as any;
          store.set?.({ name, value: "", ...options });
        } catch {
          // ignored
        }
      },
    },
  });
}

