# Brand OS

Self-serve Brand OS — SaaS Lab (Sprint 1).

## Objectif produit
- UI légère, « native-like », claire (pas de dark-ops).
- Moteur: Brand OS + mega-prompt + gen V2 + apprentissage NL→mega.
- FR-first, routes stubs prêtes: onboarding et app.

## Stack
- Next.js (App Router) + TypeScript + Tailwind v4
- Supabase via `@supabase/ssr` et `@supabase/supabase-js`
- Sortie `standalone` (Railway-friendly)

## Démarrage local
1. Prérequis: Node 18+ (recommandé 20+), npm.
2. Installer:
   ```bash
   npm install
   ```
3. Configurer l’environnement: copier `.env.example` vers `.env.local` et renseigner:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Optionnel: `SUPABASE_SERVICE_ROLE_KEY` (non utilisé en dev UI)
   - Optionnel: `WAVESPEED_API_KEY` (non utilisé dans ce sprint)
4. Lancer:
   ```bash
   npm run dev
   ```
5. Build:
   ```bash
   npm run build
   npm start
   ```

## Routes FR (stubs)
- `/` · Landing OB-01 (URL ou texte NL)
- `/onboarding/*` · OB-01 → OB-06 (sans chrome)
- `/app` · Chrome : Marque · Créer · Studio · Calendrier · Expert + sélecteur de client (stub)
- `/app/marque` · Hub lecture seule
- `/app/studio` · Liste des outs (stub)

## Dossiers
- `app/` · App Router Next.js
- `lib/supabase/` · helpers SSR/Browser Supabase
- `lib/jobs/` · stubs de jobs de génération
- `docs/canon/` · placeholder pour le canon (à coller)
- `docs/ADR-001-stack.md` · décision stack
- `supabase/migrations/0001_init.sql` · placeholder SQL

## Hors scope (Sprint 1)
- Stripe, WaveSpeed live, scrape worker, dark-ops UI, auth avancée

