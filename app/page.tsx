import { ArrowRight, Images, MessageSquareQuote, ScanSearch } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ButtonLink, Card, Meta } from "@/components/ui";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    icon: ScanSearch,
    meta: "01 · analyser",
    title: "Une URL, et la marque est lue",
    text: "Positionnement, cible, promesse, ton, direction visuelle : la fiche d’identité que vous mettriez une journée à écrire.",
  },
  {
    icon: Images,
    meta: "02 · créer",
    title: "Des visuels qui lui ressemblent",
    text: "Chaque brief est enrichi par la direction visuelle de la marque. Social carré ou affiche au ratio A.",
  },
  {
    icon: MessageSquareQuote,
    meta: "03 · apprendre",
    title: "Vos remarques deviennent des règles",
    text: "« Moins de bleu », « toujours une main dans le cadre » : dit une fois, appliqué à toutes les créations suivantes.",
  },
] as const;

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-6 rounded-shell bg-shell p-4 md:p-6">
        <header className="flex items-center justify-between gap-4 rounded-pill bg-card p-2 pl-4">
          <Logo />
          <ButtonLink href={user ? "/app" : "/login"} variant="soft">
            {user ? "Ouvrir l’atelier" : "Se connecter"}
          </ButtonLink>
        </header>

        <section className="grid gap-6 px-2 py-12 md:py-20">
          <Meta>Pour les freelances et les petites agences</Meta>
          <h1 className="max-w-[18ch] font-display text-display text-ink md:text-hero">
            Chaque marque cliente, <em className="highlighter whitespace-nowrap">à la cimaise</em>.
          </h1>
          <p className="max-w-prose text-body text-mute">
            Brand OS lit une marque, en écrit l’identité, puis crée des visuels qui la respectent — et retient ce que vous
            lui dites. Un atelier par client, sans repartir de zéro.
          </p>
          <ButtonLink href={user ? "/app" : "/login"} className="justify-self-start">
            {user ? "Ouvrir l’atelier" : "Commencer"} <ArrowRight size={18} strokeWidth={1.75} />
          </ButtonLink>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, meta, title, text }) => (
            <Card key={meta} className="grid content-start gap-4">
              <span className="grid size-10 place-items-center rounded-pill bg-soft text-ink">
                <Icon size={18} strokeWidth={1.75} />
              </span>
              <Meta>{meta}</Meta>
              <h2 className="font-display text-h2 font-normal text-ink">{title}</h2>
              <p className="text-small text-mute">{text}</p>
            </Card>
          ))}
        </section>
      </div>
    </main>
  );
}
