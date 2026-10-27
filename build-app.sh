#!/usr/bin/env bash
# Builds the shareable desktop app: release/GearCalc vX.Y.zip containing GearCalc/GearCalc.exe.
# Run from Git Bash: ./build-app.sh
set -euo pipefail
cd "$(dirname "$0")"
VER="$(tr -d '[:space:]' < VERSION)"
PY=app/.venv/Scripts/python

echo "== web build (v$VER)"
deno task build

echo "== icon"
"$PY" app/make_icon.py app/gearcalc.ico

echo "== PyInstaller"
rm -rf build/pyinstaller dist-app
ROOT="$(pwd -W)" # PyInstaller resolves data paths from its spec folder, so pass absolute Windows paths
"$PY" -m PyInstaller --noconfirm --clean --windowed --name GearCalc \
  --icon "$ROOT/app/gearcalc.ico" \
  --add-data "$ROOT/dist;web" \
  --add-data "$ROOT/VERSION;." \
  --add-data "$ROOT/app/gearcalc.ico;." \
  --workpath build/pyinstaller --specpath build/pyinstaller --distpath dist-app \
  app/launcher.py

cp "app/HOW TO USE.txt" dist-app/GearCalc/
mkdir -p release
ZIP="release/GearCalc v$VER.zip"
rm -f "$ZIP"
(cd dist-app && powershell -NoProfile -Command "Compress-Archive -Path GearCalc -DestinationPath '../$ZIP' -Force")
rm -rf build/pyinstaller
echo "== done: $ZIP ($(du -h "$ZIP" | cut -f1))"
