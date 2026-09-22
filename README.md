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

## Auth Supabase (lien magique + mot de passe) — configuration requise
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
   - `OPENROUTER_API_KEY` (analyse de marque, prompts d’image, apprentissage). Sans clé, tout retombe sur un repli déterministe : l’app fonctionne, le Brand OS est un brouillon à compléter.
   - Optionnel: `OPENROUTER_MODEL_ANALYSIS` (défaut `anthropic/claude-sonnet-5`), `OPENROUTER_MODEL_FAST` (défaut `google/gemini-3.8-flash`), `OPENROUTER_MODEL_CHAT` (expert, défaut `anthropic/claude-sonnet-5`)
   - Pour enregistrer un secret sans l’afficher (saisie masquée → `.env.local` + Railway) : `sh scripts/set-secret.sh OPENROUTER_API_KEY`
   - Optionnel: `NEXT_PUBLIC_SITE_URL` (utilisé pour composer l’URL de rappel)

Routes auth:
- `/login` · lien magique OU e‑mail + mot de passe
- `/auth/callback` · échange de code (PKCE / lien magique) et anciens liens `token_hash`
- `/logout` · déconnexion

`proxy.ts` (convention Next 16, ex‑`middleware.ts`) protège `/app/**` et `/onboarding/**` : il vérifie la signature du JWT Supabase (`getClaims()`), rafraîchit la session, et redirige vers `/login?next=…` sinon. Chaque page et route API revalide ensuite l’utilisateur (`getUser()`), la RLS restant la dernière barrière.

`createSupabaseServerClient()` est **asynchrone** (`await cookies()` obligatoire en Next 16) : toujours `const supabase = await createSupabaseServerClient();`.

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
- OB‑02 — Lecture: fetch best‑effort serveur (timeouts, fallback NL‑only). Stocke corpus brut en JSONB. L’URL étant saisie par l’utilisateur, le fetch passe par `lib/safe-fetch.ts` (anti‑SSRF : http(s) et ports standard uniquement, adresses privées/loopback/metadata refusées au moment de la résolution DNS, redirections revalidées, taille plafonnée). Tests : `npm test`.
- OB‑03 — Construction: analyse LLM du corpus → Brand OS structuré (positionnement, cible, promesse, ton, piliers, direction visuelle) stocké dans `brand_os_versions.canon`, résumé lisible dans `summary`, consignes créatives dans `mega_prompts` v1. Une seule analyse par marque (idempotent).
- OB‑04 — Soft confirm: utilisateur confirme/édite. Mise à jour Brand OS / mega.
- OB‑05 — Preuve créa: lance une génération Social 1:1 réelle (WaveSpeed). Crée `jobs` (durable) + `outs` (URL WaveSpeed et/ou path Storage). Permet “Garder” ≥1 `out`. Feedback NL possible (soft bump du méga).
- OB‑06 — Entrée BO: si ≥1 `out` gardé (ou OK explicite), redirige `/app/marque` et marque `onboarding_sessions` complété.

Aucune chrome avant OB‑06.

## Accès App
- `/` · Landing (CTA contextuel selon session)
- `/onboarding/*` · OB‑01 → OB‑06
- `/app` · Chrome: Marque · Créer · Studio · Calendrier · Expert + sélecteur de marque
- `/app/marque` · **La planche de marque** (cœur du produit, faite pour être montrée) : logo lu sur le site du client, nom, promesse, ton, palette en vraies couleurs, mur des créations gardées, positionnement, cible, voix en exemples (elle dirait / jamais), piliers, direction visuelle, stratégie. Lecture seule : chaque section se revoit avec l’expert. Export PDF, lien public révocable. Coulisses repliées : règles, couleur d’atelier, relancer l’analyse, versions avec **restauration** (toujours sous forme de nouvelle version)
- `/p/[token]` · Planche publique en lecture seule (noindex). Seule route qui lit avec la clé de service, strictement par jeton et limitée aux champs de la planche
- `/app/clients` · **Mes clients** (page d’arrivée dès qu’il y en a plusieurs) : une carte par client à sa couleur, avec sa dernière création et ses signaux (Brand OS en brouillon, propositions de l’expert, brouillons à trier, prochaine publication) ; ajouter, renommer, archiver / restaurer (rien n’est jamais supprimé)
- `/app` · Accueil du client actif : « ce qui vous attend » (chaque ligne mène là où ça se règle), création rapide, retour à l’expert, dernières créations, prochaines publications, derniers changements de la marque
- `/app/studio` · **Créer et trier au même endroit** (l’ancienne page Créer y redirige) : brief + **support** choisi dans un catalogue de 36 formats rangés par usage (réseaux sociaux, site & e-commerce, publicité, impression en 4K, présentations) ou **sur mesure** (n’importe quel support décrit en mots + un ratio) → **3 propositions** en parallèle, chacune avec son propre prompt. « Partir d’un vrai produit » : une photo de la **photothèque** du client, dont le sujet est gardé à l’identique dans une nouvelle scène. Par création : Garder, Télécharger, Planifier, Archiver, et deux gestes séparés — **Retoucher cette image** (un changement, la marque n’est pas touchée) ou **En parler à l’expert** (il regarde cette image et propose un changement de la marque). « D’où vient cette image » montre ce qui a été envoyé au modèle.
- `/app/calendrier` · Planning éditorial : grille mensuelle, planification d’une création gardée (date, canal, légende), légende rédigée par LLM, statut publiée ; aucune publication automatique
- `/app/expert` · **Poste de pilotage de la marque**, en langage naturel : l’expert (marketing + DA) regarde les dernières créations **en image**, les compare au Brand OS, discute stratégie, puis propose un changement du Brand OS et/ou du mega‑prompt, affiché avant → après. « Appliquer » crée une nouvelle version ; tous les contenus suivants en tiennent compte. Il ne produit pas de contenu (c’est le rôle de Créer).

## Dossiers
- `app/` · App Router Next.js
- `lib/supabase/` · helpers SSR/Browser Supabase
- `lib/jobs/` · pipeline de génération (WaveSpeed) + persistance `jobs`/`outs`
- `lib/brand-os/` · modèle Brand OS, schémas JSON, replis déterministes (`model.ts`, pur et testé) + orchestration LLM (`index.ts`)
- `lib/llm/openrouter.ts` · client OpenRouter (sortie JSON stricte)
- `lib/expertise/` · fiche d’expertise par support (`model.ts` pur et testé, `index.ts` lecture / rédaction / stockage) ; servie par `POST /api/expertise`
- `docs/canon/` · placeholder pour le canon (à coller)
- `docs/ADR-001-stack.md` · décision stack
- `supabase/migrations/0001_init.sql` · schéma principal (RLS multi‑tenant)
- `supabase/migrations/0002_storage_outs.sql` · bucket Storage `outs` + politiques
- `supabase/migrations/0003_fix_org_members_rls.sql` · helpers `is_org_member`/`is_org_admin` (SECURITY DEFINER) et nouvelles policies `org_members` pour éviter la récursion RLS
- `supabase/migrations/0004_calendar.sql` · table `calendar_entries`, RLS via `is_active_org_member()`. **Appliquée en production, ne plus la modifier.**
- `supabase/migrations/0005_expert_and_clients.sql` · table `expert_messages` (conversation + propositions) et colonne `brands.archived_at`. Rejouable ; le contrôle final doit renvoyer 5 lignes. Avant son application : l’expert fonctionne sans mémoriser la conversation, et l’archivage d’un client affiche un bandeau.
- `supabase/migrations/0006_brand_shares.sql` · table `brand_shares` (jeton de 32 octets, révocable ; aucune politique pour les visiteurs anonymes). Contrôle final : 3 lignes. Avant son application, « Créer un lien public » affiche un bandeau.
- `supabase/migrations/0007_brand_assets.sql` · table `brand_assets` (photothèque : ce que montre chaque photo). Les fichiers vont dans le bucket `outs`, sous `brands/<id>/references/`. Contrôle final : 3 lignes. Avant son application, la photothèque affiche un bandeau et le reste du Studio fonctionne.
- `supabase/migrations/0008_medium_briefs.sql` · table `medium_briefs` (fiche d’expertise d’un support, rédigée une fois par le modèle, une par organisation et par support). Contrôle final : 3 lignes. Avant son application, les fiches sont gardées 30 minutes en mémoire puis réécrites.
- `supabase/migrations/0009_calendar_planning.sql` · statut `proposed` des publications, colonnes `angle`, `idea`, `client_status`, `client_comment`, `client_reviewed_at`, et table `calendar_shares` (lien public de validation du planning, jeton révocable, rien d’ouvert aux anonymes). Contrôle final : 8 lignes. Avant son application : le calendrier fonctionne, sans propositions ni lien client.
- `supabase/migrations/0010_expert_conversations.sql` · table `expert_conversations` (une conversation par sujet ou bilan, par client) et colonnes `conversation_id`, `creations`, `applied_os_version`, `applied_mega_version` sur `expert_messages` ; les messages existants sont rattachés à une « Conversation d’origine ». Contrôle final : 8 lignes. Avant son application, l’expert garde un seul fil par client.

> Note migrations: si l’agent MCP ne peut pas appliquer les migrations en staging, exécutez manuellement `0003_fix_org_members_rls.sql` dans le SQL Editor Supabase (projet staging) afin de corriger les erreurs 500 liées au login (récursion détectée dans `org_members`).

## Génération (WaveSpeed) & Apprentissage
- Clé requise: `WAVESPEED_API_KEY` (Railway: variable déjà configurée en staging).
- Modèles (API REST v3 WaveSpeed) : `openai/gpt-image-2.5-flare/text-to-image` pour les propositions, `openai/gpt-image-2.5-sunburst/edit` dès qu’il y a une photo de référence (remise en scène d’un produit, retouche). Variables : `WAVESPEED_MODEL`, `WAVESPEED_MODEL_EDIT`, `WAVESPEED_QUALITY`. Ces modèles prennent un ratio et une résolution, pas une taille en pixels.
- Le modèle d’image reçoit une description d’image, pas de la stratégie : `composeImagePrompt()` (LLM rapide) transforme Brand OS + règles apprises + brief + format en prompt anglais. Formats : `social_square`, `print_a4`, `print_a3` (`lib/brand-os/model.ts`) — les formats print sont au ratio A, plafonnés à 1536 px (pas du 300 dpi).
- Dégradation gracieuse: sans clé API, le job échoue proprement (message FR clair).
- Les images sont soit stockées via URL (WaveSpeed CDN), soit répliquées dans Supabase Storage (`outs/brands/{brandId}/*.jpg`) si possible.
- Feedback NL (OB‑05, Studio): le LLM fusionne le feedback dans la liste de règles (`mega_prompts.content.rules`, 12 max, sans doublon ni contradiction) et crée une nouvelle version avec changelog. Éditer le Brand OS ne touche jamais au mega‑prompt.

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

