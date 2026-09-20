# ADR-002 · Durcissement auth & fetch serveur

Statut: accepté

Contexte:
- OB‑02 récupère côté serveur une URL saisie par l’utilisateur. Sans validation, tout compte inscrit pouvait faire lire au serveur une adresse interne (loopback, `169.254.169.254`, réseaux privés, `*.railway.internal`) et en récupérer le contenu via le corpus stocké (SSRF).
- `middleware.ts` laissait passer toute requête portant un cookie *nommé* `sb-…`/`supabase…`, sans vérifier la session.
- `cookies()` est asynchrone en Next 16 : l’accès synchrone renvoie `undefined` sans erreur. `createSupabaseServerClient()` ne lisait donc jamais la session et n’écrivait jamais les cookies d’auth.

Décisions:
1. Tout fetch serveur d’une URL fournie par un utilisateur passe par `lib/safe-fetch.ts`. La vérification d’adresse est faite **dans le lookup DNS du socket** (`node:http(s)` + `lookup` gardé), pas avant : l’IP validée est l’IP contactée, ce qui ferme la fenêtre de DNS rebinding qu’aurait laissée un `dns.lookup()` suivi d’un `fetch()`.
2. Redirections suivies manuellement (3 max), chaque saut revalidé. Ports non standard, identifiants dans l’URL et protocoles autres que http(s) refusés. Corps plafonné à 2 Mo, types `text/html`, `text/plain`, `application/xhtml+xml` uniquement.
3. `middleware.ts` devient `proxy.ts` (convention Next 16) et valide le JWT via `supabase.auth.getClaims()` (vérification de signature, locale avec des clés asymétriques). Échec ou absence de session = redirection `/login`.
4. Le proxy reste un contrôle optimiste : pages et routes API appellent `getUser()`, et la RLS reste la dernière barrière. `/api/jobs/[id]` renvoie désormais 401 sans session au lieu de s’appuyer sur la seule RLS.
5. `createSupabaseServerClient()` devient asynchrone et utilise l’API `getAll`/`setAll` de `@supabase/ssr` (l’API `get`/`set`/`remove` est dépréciée).

Conséquences:
- `safe-fetch.ts` requiert le runtime Node.js (`node:dns`, `node:net`) : ne pas passer la route d’onboarding en `runtime = "edge"`.
- Sites servis sur un port non standard : non lisibles à l’OB‑02 (fallback NL‑only, comportement déjà prévu).
- Tests du garde‑fou avec le runner natif de Node, sans dépendance : `npm test`.
