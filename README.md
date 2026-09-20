# Brand OS

Self-serve Brand OS — SaaS Lab (Sprint 1).

## Objectif produit
- UI légère, « native-like », claire (pas de dark-ops).
- Moteur: Brand OS + mega‑prompt + génération Social (WaveSpeed) + apprentissage NL→mega.
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
   - `WAVESPEED_API_KEY` (obligatoire pour la génération d’images)
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
- OB‑05 — Preuve créa: lance une génération Social 1:1 réelle (WaveSpeed). Crée `jobs` (durable) + `outs` (URL WaveSpeed et/ou path Storage). Permet “Garder” ≥1 `out`. Feedback NL possible (soft bump du méga).
- OB‑06 — Entrée BO: si ≥1 `out` gardé (ou OK explicite), redirige `/app/marque` et marque `onboarding_sessions` complété.

Aucune chrome avant OB‑06.

## Accès App
- `/` · Landing (CTA contextuel selon session)
- `/onboarding/*` · OB‑01 → OB‑06
- `/app` · Chrome: Marque · Créer · Studio · Calendrier · Expert + sélecteur de marque
- `/app/marque` · Lit Brand OS + Mega pour la marque active, historique versions, édition légère (crée nouvelles versions)
- `/app/creer` · Choisit Social/Print (print en stub), brief NL, lance génération, affiche progression
- `/app/studio` · Liste les `outs` de la marque: aperçu, Garder/Archiver, feedback NL (méga++), re‑gen

## Dossiers
- `app/` · App Router Next.js
- `lib/supabase/` · helpers SSR/Browser Supabase
- `lib/jobs/` · pipeline de génération (WaveSpeed) + persistance `jobs`/`outs`
- `docs/canon/` · placeholder pour le canon (à coller)
- `docs/ADR-001-stack.md` · décision stack
- `supabase/migrations/0001_init.sql` · schéma principal (RLS multi‑tenant)
- `supabase/migrations/0002_storage_outs.sql` · bucket Storage `outs` + politiques

## Génération (WaveSpeed) & Apprentissage
- Clé requise: `WAVESPEED_API_KEY` (Railway: variable déjà configurée en staging).
- Modèle: `wavespeed-ai/z-image/turbo` (API REST v3).
- Le prompt Social est composé du dernier méga + Brand OS + codes de format (1:1).
- Dégradation gracieuse: sans clé API, le job échoue proprement (message FR clair).
- Les images sont soit stockées via URL (WaveSpeed CDN), soit répliquées dans Supabase Storage (`outs/brands/{brandId}/*.jpg`) si possible.
- Feedback NL (OB‑05, Studio): crée une nouvelle version de `mega_prompts` (soft bump, changelog). Les générations suivantes lisent toujours la dernière version.

## Tests manuels
1. Terminer l’OB (ou créer une marque de test).
2. Aller dans `/app/creer` → lancer une génération Social → observer la progression → ouvrir dans Studio.
3. Dans `/app/studio`, garder une sortie, archiver, envoyer un feedback NL puis re‑générer.
4. Dans `/app/marque`, éditer le Brand OS et enregistrer une nouvelle version (v+1).

## Test rapide du tunnel (staging Railway)
1. Ouvrir `https://web-production-79264.up.railway.app/login`, entrer votre e‑mail.
2. Cliquer le lien reçu → `/auth/callback`.
3. Suivre OB‑01 → OB‑06, ou utiliser `/app/creer` directement si vous avez déjà une marque.
4. Vérifier que `/app/studio` affiche une image réelle. Le feedback NL doit incrémenter la version de `mega_prompts`.

