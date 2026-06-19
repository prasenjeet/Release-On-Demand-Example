#!/usr/bin/env bash
# Toggle a feature flag in flags/flags.json
# Usage: ./scripts/toggle-flag.sh <flag-name> [on|off]
# Requires: jq  (brew install jq / apt install jq)

set -euo pipefail

FLAGS_FILE="$(cd "$(dirname "$0")/.." && pwd)/flags/flags.json"
FLAG="${1:-}"
VALUE="${2:-on}"

if [[ -z "$FLAG" ]]; then
  echo "Usage: $0 <flag-name> [on|off]"
  echo ""
  echo "Available flags:"
  jq -r '.flags | keys[]' "$FLAGS_FILE" | sed 's/^/  • /'
  exit 1
fi

if [[ "$VALUE" != "on" && "$VALUE" != "off" ]]; then
  echo "❌  Value must be 'on' or 'off', got: $VALUE"
  exit 1
fi

if ! jq -e ".flags[\"$FLAG\"]" "$FLAGS_FILE" > /dev/null 2>&1; then
  echo "❌  Flag '$FLAG' not found."
  echo ""
  echo "Available flags:"
  jq -r '.flags | keys[]' "$FLAGS_FILE" | sed 's/^/  • /'
  exit 1
fi

CURRENT=$(jq -r ".flags[\"$FLAG\"].defaultVariant" "$FLAGS_FILE")
jq ".flags[\"$FLAG\"].defaultVariant = \"$VALUE\"" "$FLAGS_FILE" > /tmp/_flags_tmp.json
mv /tmp/_flags_tmp.json "$FLAGS_FILE"

echo "✅  Flag '$FLAG': $CURRENT → $VALUE"
echo "    flagd will hot-reload flags.json automatically."
