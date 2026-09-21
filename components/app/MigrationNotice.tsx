import { Notice } from "@/components/ui";

/** Shown by a feature whose tables do not exist yet on this Supabase project. */
export function MigrationNotice({ feature }: { feature: string }) {
  return (
    <Notice tone="warning">
      {feature} attend une mise à jour de la base de données. Ouvrez Supabase → SQL Editor, collez le contenu de{" "}
      <code className="font-mono text-meta">supabase/migrations/0004_calendar_playbooks.sql</code>, exécutez, puis
      rechargez cette page.
    </Notice>
  );
}
