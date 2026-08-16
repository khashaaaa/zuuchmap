#!/usr/bin/env bash
# Converts zuuchmap_app / zuuchmap_engine / zuuchmap_web from git submodules
# into plain tracked directories of this repo (fresh history — each app's
# prior commits stay on its own GitHub repo for reference, untouched).
#
# Usage:
#   scripts/migrate-to-monorepo.sh                 # de-submodule + commit only
#   scripts/migrate-to-monorepo.sh <new-remote-url> # also set origin + push
#
# Safe to run from repo root only. Refuses to run if any submodule has
# uncommitted changes (those would be silently dropped from history).

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

APPS=(zuuchmap_app zuuchmap_engine zuuchmap_web)

for name in "${APPS[@]}"; do
  if [ -n "$(git -C "$name" status --porcelain 2>/dev/null)" ]; then
    echo "Refusing: $name has uncommitted changes. Commit or stash them first." >&2
    exit 1
  fi
done

for name in "${APPS[@]}"; do
  echo "== De-submoduling $name =="
  git rm --cached "$name" >/dev/null
  rm -rf "$name/.git"
  git config --remove-section "submodule.$name" 2>/dev/null || true
  rm -rf ".git/modules/$name"
done

rm -f .gitmodules
git add "${APPS[@]}" package.json scripts .gitignore CLAUDE.md .claude/skills 2>/dev/null || true

git commit -m "$(cat <<'EOF'
Consolidate zuuchmap_app/engine/web into a single monorepo

Drops submodule wiring; fresh history from the current working tree.
Each app's prior commits remain on its own GitHub repo for reference.
EOF
)"

echo "De-submodule commit created."

if [ "${1:-}" != "" ]; then
  NEW_REMOTE="$1"
  echo "== Setting origin to $NEW_REMOTE and pushing =="
  git remote remove origin 2>/dev/null || true
  git remote add origin "$NEW_REMOTE"
  git push -u origin "$(git branch --show-current)"
else
  echo "No remote URL given — skipping push. Re-run with the new repo URL to push, e.g.:"
  echo "  scripts/migrate-to-monorepo.sh git@github.com:khashaaaa/zuuchmap.git"
fi
