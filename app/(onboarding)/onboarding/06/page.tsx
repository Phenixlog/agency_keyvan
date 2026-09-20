import Link from "next/link";

export default function OB06() {
  return (
    <div className="w-full max-w-xl rounded-xl bg-white p-8 shadow-sm ring-1 ring-black/5">
      <h2 className="text-2xl font-semibold text-zinc-900">
        OB-06 · Finalisation
      </h2>
      <p className="mt-2 text-zinc-700">
        Merci. Vos informations sont prêtes pour le Studio.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Link
          href="/onboarding/05"
          className="text-zinc-600 underline underline-offset-4"
        >
          Retour
        </Link>
        <Link
          href="/app"
          className="ml-auto inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-white hover:opacity-90"
        >
          Entrer dans l’app
        </Link>
      </div>
    </div>
  );
}

