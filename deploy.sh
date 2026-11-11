#!/usr/bin/env bash
# Build and publish the site to the gh-pages branch.
# Usage: npm run deploy
set -euo pipefail

cd "$(dirname "$0")"

REPO_URL="$(git remote get-url origin)"

npm run build

cd dist
touch .nojekyll

rm -rf .git
git init -q
git add -A
git commit -qm "deploy: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git branch -M gh-pages
git push -f "$REPO_URL" gh-pages

cd ..
SLUG_PATH="${REPO_URL%.git}"
OWNER="$(basename "$(dirname "$SLUG_PATH")")"
SLUG="$(basename "$SLUG_PATH")"

case "$SLUG" in
  *.github.io) LIVE="https://${SLUG}/" ;;
  *)           LIVE="https://${OWNER}.github.io/${SLUG}/" ;;
esac

echo "→ pushed to gh-pages (owner: $OWNER, repo: $SLUG)"
echo "→ live at: ${LIVE}"
