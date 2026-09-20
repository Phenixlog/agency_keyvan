import Link from "next/link";

export default function OB01() {
  return (
    <div className="w-full max-w-xl rounded-xl bg-white p-8 shadow-sm ring-1 ring-black/5">
      <h2 className="text-2xl font-semibold text-zinc-900">OB-01 · Sources</h2>
      <p className="mt-2 text-zinc-700">
        Fournissez une URL ou un texte de départ (si non saisi sur la page
        précédente).
      </p>
      <input
        className="mt-4 w-full rounded-md border border-zinc-300 px-3 py-2 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        placeholder="https://votre-marque.com ou description NL"
      />
      <div className="mt-6 flex items-center gap-3">
        <Link
          href="/onboarding"
          className="text-zinc-600 underline underline-offset-4"
        >
          Retour
        </Link>
        <Link
          href="/onboarding/02"
          className="ml-auto inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-white hover:opacity-90"
        >
          Suivant
        </Link>
      </div>
    </div>
  );
}

