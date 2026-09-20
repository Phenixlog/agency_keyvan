import Link from "next/link";

export default function OB02() {
  return (
    <div className="w-full max-w-xl rounded-xl bg-white p-8 shadow-sm ring-1 ring-black/5">
      <h2 className="text-2xl font-semibold text-zinc-900">OB-02 · Cibles</h2>
      <p className="mt-2 text-zinc-700">
        Décrivez vos audiences prioritaires et vos personas (brefs points).
      </p>
      <textarea
        className="mt-4 w-full rounded-md border border-zinc-300 px-3 py-2 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        rows={5}
        placeholder="- CTO SaaS B2B\n- Product Managers..."
      />
      <div className="mt-6 flex items-center gap-3">
        <Link
          href="/onboarding/01"
          className="text-zinc-600 underline underline-offset-4"
        >
          Retour
        </Link>
        <Link
          href="/onboarding/03"
          className="ml-auto inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-white hover:opacity-90"
        >
          Suivant
        </Link>
      </div>
    </div>
  );
}

