import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrCreateDefaultOrgForUser } from "@/lib/orgs";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams: searchParamsPromise,
}: {
  searchParams?: Promise<{ sent?: string; email?: string; error?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  async function sendMagicLink(formData: FormData) {
    "use server";
    const email = String(formData.get("email") || "").trim();
    if (!email) {
      return;
    }
    const supabase = await createSupabaseServerClient();
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

  async function passwordLogin(formData: FormData) {
    "use server";
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    if (!email || !password) {
      redirect("/login?error=missing");
    }
    // redirect() works by throwing: keep every call outside the try block,
    // otherwise the catch swallows it and a successful login lands on an error.
    let nextPath: string;
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error || !data?.user) {
        // Log the reason only: no e-mail, no password (server logs are retained).
        // The code tells a wrong password from an unconfirmed e-mail for support.
        console.warn(
          `[login] refus Supabase: code=${error?.code ?? "?"} status=${error?.status ?? "?"}`
        );
        // On screen, wrong password and unconfirmed e-mail share one message:
        // telling them apart would reveal which addresses have an account.
        nextPath = error?.status === 429 ? "/login?error=ratelimit" : "/login?error=badcreds";
      } else {
        // Ensure org/membership (uses service-role bootstrap when available)
        await getOrCreateDefaultOrgForUser(data.user.id, data.user.email ?? undefined);

        // Decide next: completed onboarding -> /app, else /onboarding
        const { data: existingOb } = await supabase
          .from("onboarding_sessions")
          .select("id,status")
          .eq("created_by", data.user.id)
          .order("created_at", { ascending: false })
          .limit(1);
        const latest = existingOb && existingOb.length > 0 ? existingOb[0] : null;
        nextPath = latest?.status === "completed" ? "/app" : "/onboarding";
      }
    } catch (e) {
      console.error("[login] échec après authentification:", e);
      nextPath = "/login?error=server";
    }
    redirect(nextPath);
  }

  const sent = Boolean(searchParams?.sent);
  const error = (searchParams?.error || "").toLowerCase();
  const errorMessage =
    error === "callback"
      ? "La confirmation de connexion a échoué. Réessayez."
      : error === "nocode"
      ? "Lien invalide ou expiré. Réessayez depuis la page de connexion."
      : error === "badcreds"
      ? "Connexion refusée. Vérifiez votre e‑mail et votre mot de passe ; si votre compte est récent, confirmez d’abord votre e‑mail."
      : error === "missing"
      ? "Veuillez saisir un e‑mail et un mot de passe."
      : error === "ratelimit"
      ? "Trop de tentatives. Patientez une minute avant de réessayer."
      : error === "server"
      ? "Connexion réussie, mais la préparation de votre espace a échoué. Réessayez."
      : "";

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 py-16">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-black/5">
        <h1 className="text-2xl font-semibold text-zinc-900">Connexion</h1>
        {errorMessage ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <h2 className="mt-5 text-sm font-semibold text-zinc-900">
          Lien magique
        </h2>
        <p className="mt-1 text-sm text-zinc-700">
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

        <div className="my-8 h-px bg-zinc-200" />

        <h2 className="text-sm font-semibold text-zinc-900">
          E‑mail + mot de passe
        </h2>
        <form action={passwordLogin} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="pw-email"
              className="block text-sm font-medium text-zinc-800"
            >
              E‑mail
            </label>
            <input
              id="pw-email"
              name="email"
              type="email"
              required
              placeholder="vous@entreprise.com"
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label
              htmlFor="pw-password"
              className="block text-sm font-medium text-zinc-800"
            >
              Mot de passe
            </label>
            <input
              id="pw-password"
              name="password"
              type="password"
              required
              placeholder="••••••••"
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-white hover:opacity-90"
          >
            Se connecter
          </button>
        </form>
      </div>
    </main>
  );
}

