import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PasswordForm } from "./PasswordForm";

export const dynamic = "force-dynamic";

/** First arrival of an invited colleague: a password of their own, then the workshop. */
export default async function SetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-6 px-4 py-12">
      <header className="grid gap-2">
        <span className="font-mono text-meta text-mute">Brand OS · invitation</span>
        <h1 className="font-display text-display text-ink">Choisissez votre mot de passe</h1>
        <p className="text-body text-mute">Vous êtes connecté avec {user.email}. Ce mot de passe servira à toutes vos prochaines connexions.</p>
      </header>
      <PasswordForm />
    </main>
  );
}
