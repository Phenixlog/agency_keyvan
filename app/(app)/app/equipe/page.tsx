import { Mail, UserMinus, Users } from "lucide-react";
import { Card, CardHeader, Field, Input, Meta, Notice, Tag } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { getTeam } from "@/lib/team";
import { getWorkspace } from "@/lib/workspace";
import { invite, remove } from "./actions";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const ROLE: Record<string, string> = { owner: "propriétaire", admin: "administrateur", member: "membre" };

/** The people who share this workshop: every client, every creation, every conversation with the expert. */
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ ok?: string; erreur?: string }> }) {
  const { userId, email } = await getWorkspace();
  const { ok, erreur } = await searchParams;
  const user = { id: userId, email };
  const { me, members } = await getTeam(user);
  const canInvite = me?.role === "owner" || me?.role === "admin";

  return (
    <>
      <header>
        <Meta>{members.length} personne{members.length > 1 ? "s" : ""} dans l’atelier</Meta>
        <h1 className="mt-2 font-display text-display text-ink">Équipe</h1>
        <p className="mt-2 max-w-prose text-body text-mute">Tout le monde ici voit les mêmes clients, les mêmes créations et les mêmes conversations avec l’expert.</p>
      </header>

      {ok ? <Notice tone="success">{ok}</Notice> : null}
      {erreur ? <Notice tone="danger">{erreur}</Notice> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Users size={18} strokeWidth={1.75} /> Les membres</span>} />
          <ul className="mt-4 divide-y divide-line">
            {members.map((member) => (
              <li key={member.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="grid min-w-0 gap-0.5">
                  <span className="truncate text-body text-ink">{member.email || "adresse inconnue"}{member.userId === user.id ? " (vous)" : ""}</span>
                  <Meta>{member.joinedAt ? `depuis le ${DATE.format(new Date(member.joinedAt))}` : "invitation en attente"}</Meta>
                </span>
                <span className="flex items-center gap-2">
                  <Tag tone={member.role === "owner" ? "success" : "neutral"}>{ROLE[member.role] ?? member.role}</Tag>
                  {canInvite && member.role !== "owner" ? (
                    <form action={remove}>
                      <input type="hidden" name="userId" value={member.userId} />
                      <SubmitButton variant="ghost" pendingLabel="…">
                        <UserMinus size={16} strokeWidth={1.75} /> Retirer
                      </SubmitButton>
                    </form>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Mail size={18} strokeWidth={1.75} /> Inviter</span>} />
          {canInvite ? (
            <form action={invite} className="mt-4 grid gap-4">
              <Field label="Adresse e-mail" hint="La personne reçoit un e-mail d’invitation, choisit son mot de passe, et obtient le même accès que vous : tous les clients, tous les écrans.">
                <Input name="email" type="email" required placeholder="associe@entreprise.fr" autoComplete="off" />
              </Field>
              <SubmitButton pendingLabel="Envoi de l’invitation…" className="justify-self-start">
                <Mail size={18} strokeWidth={1.75} /> Envoyer l’invitation
              </SubmitButton>
            </form>
          ) : (
            <p className="mt-4 text-small text-mute">Seul le propriétaire de l’organisation peut inviter.</p>
          )}
        </Card>
      </div>
    </>
  );
}
