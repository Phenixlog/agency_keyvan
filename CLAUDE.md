@AGENTS.md

# Brand OS

SaaS self-serve pour **freelances et petites agences** : on donne l'URL ou la description d'une marque, l'outil en tire un Brand OS (positionnement, ton, direction visuelle), génère des visuels social/print cohérents, et apprend des retours. Nom de travail : la DA ne repose pas dessus.

- Prod : Railway `brand-os-app` / `web` → https://web-production-79264.up.railway.app (déploie `main`)
- Supabase : projet « Agency » (RLS multi-tenant : orgs → org_members → brands → brand_os_versions / mega_prompts / outs / jobs)
- Local : `npm run dev` (port 3000, seul port autorisé dans les redirect URLs Supabase). `.env.local` se régénère avec les variables Railway.

## Stack
Next.js **16.3.5** (App Router, `proxy.ts`, pas de `middleware.ts`) · React 19 · TypeScript · Tailwind **v4** (CSS-first) · Supabase SSR · WaveSpeed (`z-image/turbo`, max ~1536 px) · OpenRouter (texte) · lucide-react · tests `node --test` (`npm test`, zéro dépendance).

## Pièges Next 16 (ont déjà causé 5 bugs bloquants ici)
- `cookies()`, `searchParams`, `params` sont des **Promises**. En synchrone : `undefined`, sans erreur en prod.
- `createSupabaseServerClient()` est **async**.
- Jamais de `redirect()` dans un `try` (il fonctionne par exception).
- Après un test, lire les logs du serveur de dev : ces bugs ne cassent ni le build ni le typage.

## Architecture
- `lib/workspace.ts` — `getWorkspace()` (cache par requête) : user, marques, marque active (cookie `active_brand`), dernier Brand OS, dernier mega, couleur de marque. Point d'entrée de tout écran de `/app`.
- `lib/brand-os/model.ts` — modèle pur et testé : types, schémas JSON, replis déterministes, formats d'image. `index.ts` — orchestration LLM ; **chaque étape LLM a un repli**, rien ne bloque sans clé.
- `lib/llm/openrouter.ts` — sortie JSON stricte. Modèles : `OPENROUTER_MODEL_ANALYSIS` (déf. `anthropic/claude-sonnet-5`), `OPENROUTER_MODEL_FAST` (déf. `google/gemini-3.8-flash`).
- `lib/jobs/engine.ts` — `queueImageGeneration({format})`, **synchrone dans l'action serveur** (10-25 s) → toujours un `SubmitButton` avec état d'attente. Le modèle d'image reçoit un prompt composé par LLM (description d'image), jamais de la stratégie.
- `lib/learning.ts` — un retour utilisateur est fusionné dans `mega_prompts.content.rules` (12 max). Éditer le Brand OS ne touche **jamais** au mega-prompt.
- `lib/safe-fetch.ts` — tout fetch serveur d'une URL utilisateur passe par là (anti-SSRF, voir `docs/ADR-002`).
- `lib/onboarding.ts` — `requireOnboardingBrand()` garde les étapes 2-6.

## Design — direction « Cimaise » (journal : `DA-DECISIONS.md`)
- `lib/tokens.ts` = source de vérité ; `app/globals.css` = miroir Tailwind. `lib/tokens.test.mjs` vérifie la parité et le contraste AA : **modifier les deux ensemble**.
- Primitives : `components/ui` (Card, BrandCard, Meta, VersionTag, Tag, Notice, Button(Link), Input, Textarea, Field, Empty, SubmitButton). Pas de classes Tailwind de couleur brute (`zinc-*`, hex) dans les écrans.
- Dispositif signature : **une seule `BrandCard` par écran**, à la couleur de la marque cliente active (`brandStyle()` posé sur le conteneur). La couleur cliente n'est jamais une couleur de texte : aplat, `bg-tint`, ou `.highlighter`.
- Sérif pour les titres, sans pour l'interface, **mono pour toute métadonnée** (version, format, date).
- Aucune carte sans donnée réelle : pas de faux KPI. Mode clair uniquement. Icônes Lucide (18 px, trait 1,75).
- Pièges de mise en page : `grid-cols-[minmax(0,1fr)]` sur les grilles qui contiennent du texte tronqué ; les durées passent par `duration-(--duration-*)`.

## Conventions
- Interface et textes en français, écrits pour l'utilisateur (pas de codes internes type « OB-05 »).
- Push direct sur `main`, commits `feat|fix|docs(module): …`. Décisions d'archi dans `docs/ADR-*.md`.
- Ne jamais logger d'e-mail ni de mot de passe ; messages de login identiques pour « mauvais mot de passe » et « e-mail non confirmé » (anti-énumération).

## Current Focus (2026-09-21)
Fait : sécurité (SSRF, proxy), auth réparée, moteur Brand OS par LLM, DA + tokens, cadre de l'app, Accueil, onboarding complet — parcours testé de bout en bout en local (création d'image réelle).

Reste, dans l'ordre :
1. Refonte sur la DA : **Marque** (édition structurée + « relancer l'analyse » → nouvelle version), **Créer** (sélecteur de format social / ratio A4 / ratio A3), **Studio** (garder, archiver, remarque → règle, re-générer), puis login et landing (encore en style scaffold `zinc-*`).
2. Nouveaux modules : **Calendrier** éditorial (table + migration, planifier les créations gardées, pas de publication auto), **Expert** (playbooks tirés du Brand OS).
3. `OPENROUTER_API_KEY` n'est pas encore configurée (Railway + `.env.local`) : tout tourne en mode repli. L'analyse LLM n'a jamais été exécutée avec une vraie clé.
4. À surveiller : bucket Storage `outs` public (URLs non devinables mais lisibles par tous) ; alias CSS hérités (`paper`, `accent`) à retirer une fois tous les écrans migrés.
