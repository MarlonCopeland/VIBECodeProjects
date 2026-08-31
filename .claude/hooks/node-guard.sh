#!/usr/bin/env bash
# Cheap pre-filter so unrelated Bash commands never pay a node startup.
input=$(cat)
case "$input" in
  *npm*|*npx*|*node*|*yarn*|*pnpm*|*expo*|*eas*) ;;
  *) exit 0 ;;
esac
printf '%s' "$input" | node "$(dirname "$0")/node-guard.mjs" 2>/dev/null || true
