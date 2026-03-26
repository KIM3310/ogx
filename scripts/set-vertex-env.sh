#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "usage: $0 <gcp-project-id> [location] [credentials-json-path]" >&2
  exit 1
fi

PROJECT_ID="$1"
LOCATION="${2:-global}"
CREDS_PATH="${3:-}"
ENV_FILE="$HOME/.config/ogx/vertex-gemini.env"

mkdir -p "$(dirname "$ENV_FILE")"
[ -f "$ENV_FILE" ] || touch "$ENV_FILE"

upsert_export() {
  local key="$1"
  local value="$2"
  if rg -q "^export ${key}=" "$ENV_FILE" 2>/dev/null; then
    perl -0pi -e "s#^export ${key}=.*#export ${key}=\"${value}\"#m" "$ENV_FILE"
  else
    printf 'export %s="%s"\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

upsert_export "GOOGLE_GENAI_USE_VERTEXAI" "true"
upsert_export "GOOGLE_CLOUD_PROJECT" "$PROJECT_ID"
upsert_export "GOOGLE_CLOUD_LOCATION" "$LOCATION"
upsert_export "GOOGLE_CLOUD_REGION" "$LOCATION"
upsert_export "GEMINI_MODEL" "gemini-3.1-pro"
upsert_export "OGX_GEMINI_MODEL" "gemini-3.1-pro"
upsert_export "OGX_GEMINI_CMD" "gemini"

if [ -n "$CREDS_PATH" ]; then
  upsert_export "GOOGLE_APPLICATION_CREDENTIALS" "$CREDS_PATH"
fi

echo "updated: $ENV_FILE"
echo "next: source $ENV_FILE"
