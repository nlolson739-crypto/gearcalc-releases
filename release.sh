#!/usr/bin/env bash
# Publishes a GearCalc release the same way as the Nightreign scanner:
#   1. build release/GearCalc vX.zip (./build-app.sh)
#   2. make patch-vPREV-to-vX.zip from the previous release zip (only the changed files)
#   3. gh release create vX with the whole zip; upload the patch to the "updates" pre-release
#   4. make the previous release a draft and delete its tag, so only the current one is public
# Usage: ./release.sh PREV_VERSION "release notes"     (e.g. ./release.sh 0.25 "Prayers, compact buffs")
set -euo pipefail
cd "$(dirname "$0")"
REPO="nlolson739-crypto/gearcalc-releases"
GH="${GH:-/c/Program Files/GitHub CLI/gh.exe}"
PREV="$1"; NOTES="$2"
VER="$(tr -d '[:space:]' < VERSION)"
PY=app/.venv/Scripts/python

./build-app.sh
NEW_ZIP="release/GearCalc v$VER.zip"
PREV_ZIP="release/GearCalc v$PREV.zip"
UP="build/upload"; rm -rf "$UP"; mkdir -p "$UP"
cp "$NEW_ZIP" "$UP/GearCalc-v$VER.zip"   # no spaces: GitHub turns them into dots
"$PY" tools/make_patch.py "$PREV_ZIP" "$NEW_ZIP" "$PREV" "$VER" "$UP"

printf '%s\n' "$NOTES" > "$UP/notes.md"
"$GH" release create "v$VER" "$UP/GearCalc-v$VER.zip" --repo "$REPO" --title "GearCalc v$VER" --notes-file "$UP/notes.md"
"$GH" release view updates --repo "$REPO" >/dev/null 2>&1 \
  || "$GH" release create updates --repo "$REPO" --prerelease --title "Patch updates" --notes "Small update files used by GearCalc's updater."
"$GH" release upload updates "$UP/patch-v$PREV-to-v$VER.zip" --repo "$REPO" --clobber
"$GH" release edit "v$PREV" --repo "$REPO" --draft=true || true
"$GH" api -X DELETE "repos/$REPO/git/refs/tags/v$PREV" || true
echo "== published GearCalc v$VER (patch from v$PREV)"
