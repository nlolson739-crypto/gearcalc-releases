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
rm -rf build/pyinstaller build/app-dist
ROOT="$(pwd -W)" # PyInstaller resolves data paths from its spec folder, so pass absolute Windows paths
"$PY" -m PyInstaller --noconfirm --clean --windowed --name GearCalc \
  --icon "$ROOT/app/gearcalc.ico" \
  --add-data "$ROOT/dist;web" \
  --add-data "$ROOT/VERSION;." \
  --add-data "$ROOT/app/gearcalc.ico;." \
  --workpath build/pyinstaller --specpath build/pyinstaller --distpath build/app-dist \
  app/launcher.py

cp "app/HOW TO USE.txt" build/app-dist/GearCalc/
mkdir -p release
ZIP="release/GearCalc v$VER.zip"
rm -f "$ZIP"
(cd build/app-dist && powershell -NoProfile -Command "Compress-Archive -Path GearCalc -DestinationPath '../../$ZIP' -Force")
# Refresh the unzipped copy in dist-app/ too, but never while GearCalc is running (a half-deleted folder breaks it).
if tasklist //FI "IMAGENAME eq GearCalc.exe" 2>/dev/null | grep -qi gearcalc.exe; then
  echo "(GearCalc is open, so dist-app/ was left alone; only the zip was updated)"
else
  rm -rf dist-app && mkdir -p dist-app && cp -r build/app-dist/GearCalc dist-app/
fi
rm -rf build/pyinstaller build/app-dist
echo "== done: $ZIP ($(du -h "$ZIP" | cut -f1))"
