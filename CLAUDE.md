@AGENTS.md

# Brand OS

SaaS self-serve pour **freelances et petites agences** : on donne l'URL ou la description d'une marque, l'outil en tire un Brand OS (positionnement, ton, direction visuelle), génère des visuels social/print cohérents, et apprend des retours. Nom de travail : la DA ne repose pas dessus.

- Prod : Railway `brand-os-app` / `web` → https://web-production-79264.up.railway.app (déploie `main`)
- Supabase : projet « Agency » (RLS multi-tenant : orgs → org_members → brands → brand_os_versions / mega_prompts / outs / jobs)
- Local : `npm run dev` (port 3000, seul port autorisé dans les redirect URLs Supabase). `.env.local` se régénère avec les variables Railway.

## Stack
Next.js **16.3.5** (App Router, `proxy.ts`, pas de `middleware.ts`) · React 19 · TypeScript · Tailwind **v4** (CSS-first) · Supabase SSR · WaveSpeed (**GPT Image 2.5**, choix de Keyvan : « flare » pour créer, « sunburst/edit » avec une photo de référence ; ratio + résolution jusqu'à 4K, 20-40 s par image) · OpenRouter (texte) · lucide-react · tests `node --test` (`npm test`, zéro dépendance).

## Pièges Next 16 (ont déjà causé 5 bugs bloquants ici)
- `cookies()`, `searchParams`, `params` sont des **Promises**. En synchrone : `undefined`, sans erreur en prod.
- `createSupabaseServerClient()` est **async**.
- Jamais de `redirect()` dans un `try` (il fonctionne par exception).
- Après un test, lire les logs du serveur de dev : ces bugs ne cassent ni le build ni le typage.

## Architecture
- **Marque = la planche de marque**, cœur du produit (« ce qui prouve qu'on a compris le client »). `components/brand/BrandBoard.tsx` sert l'écran Marque (`editable`) et la page publique `/p/[token]` ; données par `lib/brand-board.ts#loadBoard` (client utilisateur ou client de service). La structure du Brand OS est **l'unique source de vérité** : plus de résumé libre éditable ; on modifie en parlant à l'expert. Palette stockée en texte « nom #RRGGBB » (`parsePalette`), piliers « Titre : ligne » (`parsePillar`), `voice.says / never`. `lib/site-assets.ts` lit logo / image de partage dans le `<head>` du site (adresses validées publiques). Restaurer = recopier en nouvelle version, jamais écraser.
- `lib/clients.ts` — `listClientCards()` : tous les clients actifs et leurs signaux en 4 requêtes groupées ; sert « Mes clients » et le bloc « Ce qui vous attend » de l'accueil.
- `lib/workspace.ts` — `getWorkspace()` (cache par requête) : user, marques, marque active (cookie `active_brand`), dernier Brand OS, dernier mega, couleur de marque. Point d'entrée de tout écran de `/app`.
- `lib/brand-os/model.ts` — modèle pur et testé : types, schémas JSON, replis déterministes, formats d'image. `index.ts` — orchestration LLM ; **chaque étape LLM a un repli**, rien ne bloque sans clé.
- `lib/llm/openrouter.ts` — sortie JSON stricte. Modèles : `OPENROUTER_MODEL_ANALYSIS` (déf. `anthropic/claude-sonnet-5`), `OPENROUTER_MODEL_FAST` (déf. `google/gemini-3.8-flash`).
- `lib/jobs/engine.ts` — `queueProposals()` : 3 créations en parallèle par brief (un prompt LLM chacune, un `batch_id` commun) ; `queueImageGeneration()` en 3 modes : `describe` (texte → image), `restage` (photo de la photothèque : le sujet reste identique, la scène change), `retouch` (un seul changement sur une création). **Synchrone dans l'action serveur** (30-40 s) → toujours un `SubmitButton` avec état d'attente. Le modèle d'image reçoit une description ou une instruction composée par LLM, jamais de la stratégie.
- **Studio = créer + trier** (Créer a fusionné dedans). Deux gestes volontairement séparés par création : *retoucher cette image* (local) vs *en parler à l'expert* (`/app/expert?image=<id>` : l'expert voit cette image en premier et propose un changement de la marque). `lib/assets.ts` : photothèque par client (`brand_assets`), upload direct navigateur → Storage puis enregistrement serveur avec vérification du dossier de la marque active.
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
- **Migrations : ne jamais modifier un fichier déjà exécuté par Keyvan** (il les colle à la main dans le SQL Editor ; j'ai modifié `0004` deux fois après son passage et il a cru à tort être à jour). Tout changement = nouveau fichier numéroté, idempotent, terminé par une requête de contrôle. Le code doit tolérer la migration absente (`lib/db-errors.ts` : `isMissingTable`, `isMissingColumn`, `isForbidden`).
- Interface et textes en français, écrits pour l'utilisateur (pas de codes internes type « OB-05 »).
- Push direct sur `main`, commits `feat|fix|docs(module): …`. Décisions d'archi dans `docs/ADR-*.md`.
- Ne jamais logger d'e-mail ni de mot de passe ; messages de login identiques pour « mauvais mot de passe » et « e-mail non confirmé » (anti-énumération).

## Backlog cadré avec Keyvan (ne pas démarrer sans lui)
- **Visuels avec du texte** (titre, accroche, logo posé sur l'image) : « un vrai chantier qu'on va cadrer juste après avoir refait les différentes pages du BO » (Keyvan, 2026-09-21). Aujourd'hui toutes les images sont générées sans texte. À cadrer : composition côté navigateur vs modèle d'image, polices du client, zones réservées, export.

## Current Focus (2026-09-21)
Revue page par page avec Keyvan (« on prend du recul sur chaque page : UX, fonctionnement, ce qui manque ») : pour chaque écran, **analyser et proposer d'abord, coder seulement après son accord**. Fait : **Studio** (fusion avec Créer, 3 propositions, photothèque et remise en scène d'un vrai produit, retouche, téléchargement, planifier, provenance), **Marque** (planche visuelle, logo du site, voix en exemples, palette codée, export PDF, lien public, restauration de versions), **Accueil** (deux niveaux validés : `/app/clients` + accueil du client recentré sur l'action ; ajouter / renommer / archiver un client). Prochaine page : **Calendrier**, puis Expert, onboarding. Ensuite : cadrer le backlog « visuels avec texte ».

Vérifié en réel : auth, onboarding → création → studio, moteur LLM (clé OpenRouter en place), Expert de bout en bout (lit les images, propose, « Appliquer » crée une version, la création suivante en tient compte), Calendrier (planifier / retirer).

Reste :
1. Migration à exécuter par Keyvan : **`0007_brand_assets.sql`** (contrôle : 3 lignes) → photothèque. `0005` et `0006` sont appliquées et vérifiées (conversation mémorisée, lien public créé / ouvert sans session / coupé → 404).
2. Jamais testés en réel : l'upload dans la photothèque et une création `restage` DEPUIS l'app (le modèle, lui, a été testé en direct : même bol, nouvelle scène), la retouche depuis l'app, le logo sur une marque créée depuis une URL (la marque de test vient d'une description), la restauration de version, légende du calendrier par LLM, « Recréer » du Studio, une proposition de l'expert qui modifie le Brand OS lui-même (seules des règles ont été appliquées), archiver / restaurer un client.
3. À surveiller : bucket Storage `outs` public ; marque « [TEST] Atelier Lune » ; coût Expert ≈ 2-3 centimes par message, sans plafond ; **coût image** ≈ 7 centimes le brief (3 × 0,024 $), 12 centimes avec une photo de référence (3 × 0,039 $), plus en 4K.
