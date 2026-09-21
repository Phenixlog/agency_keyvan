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
- **Expert = poste de pilotage de la marque, pas un générateur de contenu** (définition validée par Keyvan après deux versions ratées). `lib/expert/proposal.ts` (pur, testé) : format d'une proposition, validation stricte `parseProposal` (appliquée à la sortie du modèle ET à ce que renvoie le navigateur), `applyToBrandOS` / `applyToMega`, `describeChanges` (avant → après). `app/api/expert/route.ts` : prompt système construit côté serveur, **4 dernières créations jointes en image** au dernier message (« les prompts sont une projection, les images sont du factuel »), marque déduite du cookie, réponse en streaming ; le bloc ```proposition est séparé du texte (`splitAnswer`) et stocké à part. `app/(app)/app/expert/actions.ts` : `applyProposal` → `lib/brands.ts#applyExpertProposal` crée de nouvelles versions (résumé régénéré depuis la structure) puis `revalidatePath('/app','layout')`. Le Brand OS a un bloc optionnel `strategy` (objectifs, canaux, angles, rythme).
- `lib/llm/openrouter.ts` : **marge de 2000 tokens pour la réflexion** des modèles (Gemini Flash réfléchit obligatoirement dans `max_tokens`), extraction tolérante du JSON, une seconde tentative sur réponse malformée.
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
Fait et vérifié en réel (clé OpenRouter en place, local + Railway) : analyse de marque, prompt d'image par LLM, fusion des règles, et **Expert de bout en bout** : il décrit factuellement les images produites, propose des règles, « Appliquer » crée mega-prompt v4, et la création suivante du même brief intègre les nouvelles règles dans son prompt.

Reste :
1. **Migration `0004_calendar_expert.sql`** à rejouer par Keyvan dans Supabase → SQL Editor (le dernier `select` doit renvoyer **8 lignes**). Historique des échecs : v1 → écritures refusées par la RLS (42501) ; v2 → 42P13 car `create or replace` sur `is_org_member`, dont la prod a une autre signature (ne JAMAIS la DROP) ; version actuelle = fonction dédiée `is_active_org_member`. Tant qu'elle n'est pas passée : Calendrier en lecture seule, conversation Expert non mémorisée (les changements appliqués, eux, le sont).
2. Après la migration, tester : planifier / publier / retirer une publication, légende par LLM, conversation Expert qui survit au rechargement, état « appliquée » mémorisé.
3. Jamais testés en réel : « Recréer » du Studio ; une proposition qui modifie le Brand OS lui-même (palette, ton, stratégie) — seule une proposition de règles a été appliquée pour l'instant.
4. À surveiller : bucket Storage `outs` public ; marque « [TEST] Atelier Lune » à archiver ; coût Expert ≈ 2-3 centimes par message (Sonnet 5 + 4 images), sans plafond par utilisateur.
