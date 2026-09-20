import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 w-full items-center justify-center py-24 px-6">
      <div className="w-full max-w-3xl rounded-2xl bg-white/70 p-8 shadow-sm ring-1 ring-black/5">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          Brand OS — Démarrage
        </h1>
        <p className="mt-2 text-zinc-700">
          Self-serve Brand OS pour SaaS Lab. UI claire, native-like. Moteur:
          Brand OS + mega-prompt + gen V2 + NL→mega bump learning.
        </p>
        <form
          className="mt-6 flex flex-col gap-3"
          action="/onboarding"
          method="get"
        >
          <label htmlFor="seed" className="text-sm font-medium text-zinc-800">
            URL de marque ou texte (NL)
          </label>
          <input
            id="seed"
            name="seed"
            placeholder="https://votre-marque.com ou « marque B2B pour devs »"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-white hover:opacity-90"
            >
              Commencer l’onboarding
            </button>
            <Link
              href="/app"
              className="text-accent underline underline-offset-4"
            >
              Accéder à l’app
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
