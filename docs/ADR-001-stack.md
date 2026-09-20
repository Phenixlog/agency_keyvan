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

