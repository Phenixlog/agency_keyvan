#!/bin/sh
# Enregistre un secret sans jamais l'afficher : saisie masquée, puis écriture dans .env.local
# et dans les variables du service Railway (valeur passée par stdin, jamais en argument).
# Rien n'est imprimé, rien ne passe par l'historique du shell ni par le presse-papiers d'un tiers.
#
# Usage : sh scripts/set-secret.sh OPENROUTER_API_KEY
#         SKIP_RAILWAY=1 sh scripts/set-secret.sh NOM      (local uniquement)
set -eu

NAME="${1:-}"
ENV_FILE="${ENV_FILE:-$(cd "$(dirname "$0")/.." && pwd)/.env.local}"
RAILWAY_PROJECT="${RAILWAY_PROJECT:-55bc277e-7413-4520-86fe-990f5ae87383}"
RAILWAY_SERVICE="${RAILWAY_SERVICE:-web}"
RAILWAY_ENVIRONMENT="${RAILWAY_ENVIRONMENT:-production}"

case "$NAME" in
  "" ) echo "Usage : sh scripts/set-secret.sh NOM_DE_LA_VARIABLE" >&2; exit 2 ;;
  *[!A-Z0-9_]* ) echo "Nom invalide : majuscules, chiffres et _ uniquement." >&2; exit 2 ;;
esac

printf 'Collez la valeur de %s puis Entrée (la saisie reste invisible) : ' "$NAME" >&2
# -s n'est pas POSIX : on coupe l'écho du terminal nous-mêmes, et on le rétablit quoi qu'il arrive.
if [ -t 0 ]; then
  trap 'stty echo 2>/dev/null || true' EXIT INT TERM
  stty -echo
fi
IFS= read -r VALUE
if [ -t 0 ]; then stty echo; trap - EXIT INT TERM; fi
printf '\n' >&2

VALUE=$(printf '%s' "$VALUE" | tr -d '\r\n[:space:]')
if [ -z "$VALUE" ]; then echo "Valeur vide : rien n'a été modifié." >&2; exit 1; fi
if [ "$NAME" = "OPENROUTER_API_KEY" ]; then
  case "$VALUE" in
    sk-or-*) ;;
    *) echo "Attention : une clé OpenRouter commence normalement par « sk-or- ». Rien n'a été modifié." >&2; exit 1 ;;
  esac
fi

# --- .env.local : remplace la ligne si elle existe, l'ajoute sinon --------------------------------
umask 077
TMP="$(mktemp "${ENV_FILE}.XXXXXX")"
if [ -f "$ENV_FILE" ]; then grep -v "^${NAME}=" "$ENV_FILE" > "$TMP" || true; fi
printf '%s=%s\n' "$NAME" "$VALUE" >> "$TMP"
mv "$TMP" "$ENV_FILE"
chmod 600 "$ENV_FILE"
echo "OK  .env.local : $NAME enregistrée (${#VALUE} caractères)."

# --- Railway ---------------------------------------------------------------------------------------
if [ "${SKIP_RAILWAY:-0}" = "1" ]; then
  echo "--  Railway ignoré (SKIP_RAILWAY=1)."
elif ! command -v railway >/dev/null 2>&1; then
  echo "!!  CLI Railway absente : ajoutez $NAME à la main dans Railway → $RAILWAY_SERVICE → Variables." >&2
else
  if printf '%s' "$VALUE" | railway variable set "$NAME" --stdin \
      --project "$RAILWAY_PROJECT" --service "$RAILWAY_SERVICE" --environment "$RAILWAY_ENVIRONMENT" >/dev/null 2>&1; then
    echo "OK  Railway : $NAME enregistrée sur $RAILWAY_SERVICE ($RAILWAY_ENVIRONMENT). Un redéploiement démarre."
  else
    echo "!!  Railway a refusé l'écriture : ajoutez $NAME à la main dans Railway → $RAILWAY_SERVICE → Variables." >&2
  fi
fi

unset VALUE
