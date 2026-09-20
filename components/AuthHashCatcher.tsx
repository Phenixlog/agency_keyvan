'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Captures implicit grant tokens arriving in the URL hash (/#access_token=...&refresh_token=...).
 * Sets the Supabase session on the browser client, then routes to onboarding.
 * Mounted globally (e.g. in RootLayout) so it works on '/' and any page.
 */
export default function AuthHashCatcher() {
  const router = useRouter();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const { hash, pathname, search } = window.location;
    // If a PKCE/magic-link "code" arrives on the root or any page, bounce it to /auth/callback
    const query = new URLSearchParams(search);
    const code = query.get('code');
    if (code) {
      // Preserve any other params if needed
      const next = `/auth/callback?${query.toString()}`;
      // Clear hash before navigating
      if (hash) {
        const cleanUrl = `${pathname}${search}`;
        window.history.replaceState(null, '', cleanUrl);
      }
      router.replace(next);
      return;
    }

    if (!hash || !hash.includes('access_token')) {
      return;
    }
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const access_token = params.get('access_token') || undefined;
    const refresh_token = params.get('refresh_token') || undefined;
    if (!access_token || !refresh_token) {
      // Not a complete implicit-hash payload
      return;
    }

    const supabase = createSupabaseBrowserClient();
    supabase.auth
      .setSession({ access_token, refresh_token })
      .then(({ error }) => {
        // Clear hash from the URL
        const cleanUrl = `${pathname}${search}`;
        window.history.replaceState(null, '', cleanUrl);

        if (error) {
          router.replace('/login?error=callback');
        } else {
          router.replace('/onboarding');
        }
      })
      .catch(() => {
        const cleanUrl = `${pathname}${search}`;
        window.history.replaceState(null, '', cleanUrl);
        router.replace('/login?error=callback');
      });
  }, [router]);

  return null;
}

