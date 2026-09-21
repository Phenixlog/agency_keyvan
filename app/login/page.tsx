import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { Field, Input, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrCreateDefaultOrgForUser } from "@/lib/orgs";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams: searchParamsPromise,
}: {
  searchParams?: Promise<{ sent?: string; email?: string; error?: string; next?: string }>;
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
        const wanted = String(formData.get("next") || "");
        const safeNext = /^\/(app|onboarding)(\/[\w\-/]*)?$/.test(wanted) ? wanted : null;
        nextPath = safeNext ?? (latest?.status === "completed" ? "/app" : "/onboarding");
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

  const next = searchParams?.next ?? "";

  return (
    <main className="flex min-h-screen items-start justify-center p-4 md:items-center md:p-8">
      <div className="grid w-full max-w-md grid-cols-[minmax(0,1fr)] gap-6 rounded-shell bg-shell p-4 md:p-6">
        <Link href="/" aria-label="Accueil" className="px-2">
          <Logo />
        </Link>

        <section className="grid gap-6 rounded-card bg-card p-6 md:p-8">
          <h1 className="font-display text-h1 text-ink">Connexion</h1>
          {errorMessage ? <Notice tone="danger">{errorMessage}</Notice> : null}
          {sent ? <Notice tone="success">Si un compte existe pour cet e‑mail, un lien vous a été envoyé.</Notice> : null}

          <form action={passwordLogin} className="grid gap-4">
            <input type="hidden" name="next" value={next} />
            <Field label="E‑mail">
              <Input name="email" type="email" required autoComplete="email" placeholder="vous@studio.fr" />
            </Field>
            <Field label="Mot de passe">
              <Input name="password" type="password" required autoComplete="current-password" />
            </Field>
            <SubmitButton pendingLabel="Connexion…">Se connecter</SubmitButton>
          </form>
        </section>

        <section className="grid gap-4 rounded-card bg-card p-6 md:p-8">
          <div>
            <h2 className="text-title text-ink">Sans mot de passe</h2>
            <p className="text-small text-mute">Recevez un lien de connexion par e‑mail.</p>
          </div>
          <form action={sendMagicLink} className="grid gap-4">
            <Field label="E‑mail">
              <Input name="email" type="email" required autoComplete="email" placeholder="vous@studio.fr" />
            </Field>
            <SubmitButton variant="soft" pendingLabel="Envoi…">Envoyer le lien</SubmitButton>
          </form>
        </section>
      </div>
    </main>
  );
}
