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

## Auth Supabase (magic‑link) — configuration requise
1. Dans le Dashboard Supabase > Authentication > URL de redirection, ajoutez:
   - `http://localhost:3000/auth/callback`
   - `https://web-production-79264.up.railway.app/auth/callback`
2. Dans "Site URL", mettez:
   - Dev: `http://localhost:3000`
   - Staging Railway: `https://web-production-79264.up.railway.app`
3. Renseignez les variables d’environnement (voir `.env.example`) :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Optionnel: `NEXT_PUBLIC_SITE_URL` (utilisé pour composer l’URL de rappel)

Routes auth:
- `/login` · saisie de l’e‑mail (envoi du lien magique)
- `/auth/callback` · échange de code → session (PKCE / magic‑link)
- `/logout` · déconnexion

Le middleware protège `/app/**` et `/onboarding/**` (redirige vers `/login` si non connecté).

## Démarrage local
1. Prérequis: Node 18+ (recommandé 20+), npm.
2. Installer:
   ```bash
   npm install
   ```
3. Configurer l’environnement: copier `.env.example` vers `.env.local` et renseigner:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Optionnel: `NEXT_PUBLIC_SITE_URL`
4. Lancer:
   ```bash
   npm run dev
   ```
5. Build:
   ```bash
   npm run build
   npm start
   ```

## Tunnel Onboarding (écritures réelles)
- OB‑01 — Intake: URL et/ou NL seed (+ notes). Crée/maj `onboarding_sessions` + brouillon `brands` lié à l’org de l’utilisateur.
- OB‑02 — Lecture: fetch best‑effort serveur (timeouts, fallback NL‑only). Stocke corpus brut en JSONB.
- OB‑03 — Construction: génère Brand OS (3–5 bullets) + amorce mega‑prompt (LLM si clé, sinon template déterministe). Persiste `brand_os_versions` v1 + `mega_prompts` v1.
- OB‑04 — Soft confirm: utilisateur confirme/édite. Mise à jour Brand OS / mega.
- OB‑05 — Preuve créa: UX Social+Print (génération stub) — crée `jobs` et `outs` placeholders. Permet “Garder” ≥1 `out`.
- OB‑06 — Entrée BO: si ≥1 `out` gardé (ou OK explicite), redirige `/app/marque` et marque `onboarding_sessions` complété.

Aucune chrome avant OB‑06.

## Accès App
- `/` · Landing (CTA contextuel selon session)
- `/onboarding/*` · OB‑01 → OB‑06
- `/app` · Chrome: Marque · Créer · Studio · Calendrier · Expert + sélecteur de marque
- `/app/marque` · Lit Brand OS + Mega depuis DB pour la marque active

## Dossiers
- `app/` · App Router Next.js
- `lib/supabase/` · helpers SSR/Browser Supabase
- `lib/jobs/` · stubs de jobs de génération
- `docs/canon/` · placeholder pour le canon (à coller)
- `docs/ADR-001-stack.md` · décision stack
- `supabase/migrations/0001_init.sql` · placeholder SQL

## Hors scope (Sprint 1)
- Stripe, WaveSpeed live, scrape worker, dark-ops UI, auth avancée

## Test rapide du tunnel (staging Railway)
1. Ouvrir `https://web-production-79264.up.railway.app/login`, entrer votre e‑mail.
2. Cliquer le lien reçu → `/auth/callback`.
3. Suivre OB‑01 → OB‑06. Au terme, vous arrivez sur `/app/marque` avec les lignes créées (`orgs`, `org_members`, `brands`, `brand_os_versions`, `mega_prompts`, `outs`, `jobs`, `onboarding_sessions`).

