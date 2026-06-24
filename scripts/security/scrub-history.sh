#!/usr/bin/env bash
#
# scrub-history.sh — purge the leaked credentials from this repo's git history.
#
# ⚠️ ROTATION FIRST. This repo is public and the secrets are already cloned/cached/
#    indexed elsewhere. Rewriting history does NOT undo the exposure — you MUST still
#    rotate every key (Infura, ETH_PRIVATE_KEY 0x075F227E…, Pimlico). This script is
#    optional hygiene to stop re-leaking them on fresh clones, not a substitute for rotation.
#
# ⚠️ DESTRUCTIVE. It rewrites EVERY commit hash. After running you must force-push and
#    every collaborator must re-clone (old clones keep the secrets and will reintroduce them).
#
# The leaked secrets are NOT hardcoded here — they're extracted from history at runtime
# into a .git-local (never-committed) replacements file, which is deleted afterward.
#
# Usage:
#   bash scripts/security/scrub-history.sh           # dry-run: show what would be scrubbed
#   bash scripts/security/scrub-history.sh --run     # actually rewrite history
#
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "❌ git-filter-repo not installed."
  echo "   brew install git-filter-repo   (or: pip install git-filter-repo)"
  exit 1
fi

# The commit that introduced the secrets (Dockerfile fallbacks). Adjust if needed.
SRC_COMMIT="ca83890"
REPL_FILE=".git/scrub-replacements.txt"
trap 'rm -f "$REPL_FILE"' EXIT

# Extract the literal secrets from history (Infura key, ETH key, Pimlico key).
{
  git show "$SRC_COMMIT:Dockerfile" 2>/dev/null \
    | grep -oE '7051eb377c77[0-9a-f]+|0x72966a3f[0-9a-fA-F]{56}|pim_[A-Za-z0-9]{20,}' \
    | sort -u
} > "$REPL_FILE.raw" || true

if [ ! -s "$REPL_FILE.raw" ]; then
  echo "❌ No secrets found in $SRC_COMMIT — check the commit hash / patterns."
  rm -f "$REPL_FILE.raw"
  exit 1
fi

# Build the filter-repo replacements file: <secret>==>***SCRUBBED***
: > "$REPL_FILE"
while IFS= read -r secret; do
  printf '%s==>***SCRUBBED***\n' "$secret" >> "$REPL_FILE"
done < "$REPL_FILE.raw"
COUNT=$(wc -l < "$REPL_FILE" | tr -d ' ')
rm -f "$REPL_FILE.raw"

echo "🔎 Found $COUNT distinct secret(s) to scrub from history (values hidden)."

if [ "${1:-}" != "--run" ]; then
  echo ""
  echo "Dry run. Re-run with --run to rewrite history. After --run you MUST:"
  echo "  1) git push --force --all   &&   git push --force --tags"
  echo "  2) tell every collaborator to re-clone (old clones still leak)"
  echo "  3) ROTATE the keys regardless — scrubbing doesn't undo the public exposure"
  exit 0
fi

echo "⏳ Rewriting history with git-filter-repo…"
git filter-repo --replace-text "$REPL_FILE" --force

echo ""
echo "✅ History rewritten. NOW:"
echo "  1) git push --force --all   &&   git push --force --tags"
echo "  2) all collaborators re-clone"
echo "  3) ROTATE the keys (Infura / ETH 0x075F227E… / Pimlico) — mandatory, exposure already happened"
