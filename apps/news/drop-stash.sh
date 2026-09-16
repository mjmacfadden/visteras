#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "Before:"
git stash list || true
if git rev-parse --verify refs/stash >/dev/null 2>&1; then
  git stash clear
  echo "Cleared stash."
else
  echo "No stash ref."
fi
echo "After:"
git stash list || true
