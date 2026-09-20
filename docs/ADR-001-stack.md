# ADR-001 · Stack technique (Sprint 1)

Statut: accepté

Contexte:
- Produit « Self-serve Brand OS » avec UI légère (non dark-ops), FR-first.
- Besoin d’un App Router moderne, SSR/ISR, et intégration Supabase (client SSR/Browser).
- Déploiement ami de Railway.

Décisions:
1. Next.js (v16.x via scaffold) en mode App Router, TypeScript, Tailwind v4.
2. Sortie `output: "standalone"` dans `next.config.ts` pour des images déployables facilement (Railway-friendly).
3. Tokens clairs: `paper #F5F1EA`, `accent #0E5C66`, pas de thème sombre par défaut.
4. Intégration Supabase via `@supabase/ssr` et `@supabase/supabase-js` avec helpers `lib/supabase/*`.
5. Routes FR : `/`, `/onboarding/*` (sans chrome), `/app` (avec chrome) et sous-sections.
6. Stubs de jobs de génération sans dépendance WaveSpeed.

Conséquences:
- Build `npm run build` doit réussir sans secrets (clients Supabase lisent les variables publiques).
- `.env.example` expose les clés attendues; pas d’implémentation auth étendue pour ce sprint.
- Docs: `docs/canon/` (placeholder) et cet ADR pour traçabilité.

Notes sur la version de Next:
- Option « pinner en 15.x » évaluée. Le scaffold actuel (Next 16.x) s’appuie sur React 19 et des presets (p.ex. fontes Geist via `next/font`) susceptibles d’exiger >=16. Le downgrade impliquerait React 18, une révision d’`eslint-config-next`, des types React (`@types/react@18`), et un ajustement potentiel des fontes. Risque de régressions pour un gain limité à ce stade. Décision: conserver 16.x pour Sprint 1. Un pin 15.x restera possible plus tard si requis par l’infra.

