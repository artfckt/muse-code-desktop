#!/usr/bin/env bash
set -euo pipefail
# Linux cross-build using node-pty's official Windows N-API prebuilds.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for program in node npm rsync xvfb-run; do command -v "$program" >/dev/null || { echo "Missing prerequisite: $program" >&2; exit 1; }; done
wine_binary="$(command -v wine || command -v wine64-stable || true)"
[[ -n "$wine_binary" ]] || { echo 'Install Wine before cross-building.' >&2; exit 1; }
[[ -d "$repo_root/node_modules/node-pty/prebuilds/win32-x64" ]] || { echo 'Run npm ci first.' >&2; exit 1; }
cd "$repo_root"
npm run build:renderer
mkdir -p "$repo_root/.build-cache"
stage="$(mktemp -d "$repo_root/.build-cache/windows.XXXXXX")"
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/source" "$stage/bin" "$stage/tmp" "$repo_root/release"
rsync -a --exclude=/.git/ --exclude=/release/ --exclude=/test-results/ --exclude=/playwright-report/ --exclude=/.build-cache/ "$repo_root/" "$stage/source/"
# Never package a Linux-built binding in the Windows app. N-API prebuilds
# are supplied by the pinned node-pty package and unpacked by electron-builder.
rm -rf "$stage/source/node_modules/node-pty/build"
printf '#!/bin/sh\nexec "%s" "$@"\n' "$wine_binary" > "$stage/bin/wine"
chmod +x "$stage/bin/wine"
cd "$stage/source"
TMPDIR="$stage/tmp" PATH="$stage/bin:$PATH" WINEPREFIX="$stage/wine" WINEDEBUG=-all xvfb-run -a npx electron-builder --win nsis --x64 --publish never -c.npmRebuild=false
cp release/*.exe release/*.exe.blockmap "$repo_root/release/"
cd "$repo_root/release"
sha256sum Muse-Desktop-*-Windows-x64.exe > SHA256SUMS.txt
printf 'Windows installer and SHA256SUMS.txt are in %s/release/\n' "$repo_root"
