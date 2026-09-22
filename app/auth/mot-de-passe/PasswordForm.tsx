"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LoaderCircle } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const MIN = 8;

export function PasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < MIN) return setError(`Au moins ${MIN} caractères.`);
    if (password !== confirm) return setError("Les deux saisies ne correspondent pas.");
    setBusy(true);
    // The password is set by the person, in their own browser: it never passes through our server.
    const { error } = await createSupabaseBrowserClient().auth.updateUser({ password, data: { needs_password: false } });
    setBusy(false);
    if (error) return setError("Impossible d’enregistrer ce mot de passe. Réessayez.");
    router.replace("/app");
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-card bg-card p-6">
      <Field label="Mot de passe" hint={`${MIN} caractères minimum.`}>
        <Input type="password" name="password" autoComplete="new-password" required minLength={MIN} value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Confirmez-le">
        <Input type="password" name="confirm" autoComplete="new-password" required minLength={MIN} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      {error ? <p className="text-small text-danger">{error}</p> : null}
      <Button type="submit" disabled={busy} className="justify-self-start">
        {busy ? <LoaderCircle size={18} strokeWidth={1.75} className="animate-spin" /> : <KeyRound size={18} strokeWidth={1.75} />} Enregistrer et entrer
      </Button>
    </form>
  );
}
