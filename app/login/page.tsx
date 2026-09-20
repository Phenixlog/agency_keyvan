import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { sent?: string; email?: string };
}) {
  async function sendMagicLink(formData: FormData) {
    "use server";
    const email = String(formData.get("email") || "").trim();
    if (!email) {
      return;
    }
    const supabase = createSupabaseServerClient();
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.SITE_URL ||
      "http://localhost:3000";
    const callbackUrl = `${origin}/auth/callback`;
    await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callbackUrl,
      },
    });
    redirect(`/login?sent=1&email=${encodeURIComponent(email)}`);
  }

  const sent = Boolean(searchParams?.sent);

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 py-16">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-black/5">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Connexion par lien magique
        </h1>
        <p className="mt-2 text-sm text-zinc-700">
          Recevez un lien de connexion sécurisé par e‑mail.
        </p>
        <form action={sendMagicLink} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-zinc-800"
            >
              E‑mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="vous@entreprise.com"
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-md bg-accent px-4 py-2 text-white hover:opacity-90"
          >
            Envoyer le lien
          </button>
        </form>
        {sent ? (
          <p className="mt-4 text-sm text-emerald-700">
            Si un compte existe pour cet e‑mail, un lien vous a été envoyé.
          </p>
        ) : null}
      </div>
    </main>
  );
}

