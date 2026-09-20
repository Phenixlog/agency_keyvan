import Link from "next/link";

export default function OB05() {
  return (
    <div className="w-full max-w-xl rounded-xl bg-white p-8 shadow-sm ring-1 ring-black/5">
      <h2 className="text-2xl font-semibold text-zinc-900">OB-05 · Ton</h2>
      <p className="mt-2 text-zinc-700">
        Choisissez votre style de marque (sélecteur simple).
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button className="rounded-md border border-zinc-300 bg-white px-3 py-2 hover:border-accent">
          Clair & pédagogique
        </button>
        <button className="rounded-md border border-zinc-300 bg-white px-3 py-2 hover:border-accent">
          Audacieux & direct
        </button>
        <button className="rounded-md border border-zinc-300 bg-white px-3 py-2 hover:border-accent">
          Technique & précis
        </button>
        <button className="rounded-md border border-zinc-300 bg-white px-3 py-2 hover:border-accent">
          Minimal & élégant
        </button>
      </div>
      <div className="mt-6 flex items-center gap-3">
        <Link
          href="/onboarding/04"
          className="text-zinc-600 underline underline-offset-4"
        >
          Retour
        </Link>
        <Link
          href="/onboarding/06"
          className="ml-auto inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-white hover:opacity-90"
        >
          Suivant
        </Link>
      </div>
    </div>
  );
}

