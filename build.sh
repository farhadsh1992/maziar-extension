#!/bin/bash
# Stages a loadable copy of the extension per browser — both Chrome and
# Firefox expect a file literally named manifest.json at the root, but the
# two manifests differ slightly (MV3 background: service_worker vs scripts,
# Firefox's browser_specific_settings), so this copies everything into
# dist-<browser>/ with the right one renamed into place. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")"

for browser in chrome firefox; do
  dest="dist-$browser"
  rm -rf "$dest"
  mkdir -p "$dest"
  # Copy everything except the manifest variants, dist output, and dev-only files.
  rsync -a --exclude 'manifest.*.json' --exclude 'dist-*' --exclude '.git' \
    --exclude 'backend' --exclude '.claude' --exclude 'build.sh' \
    --exclude 'README.md' --exclude 'THIRD_PARTY_LICENSES.md' \
    --exclude 'icons/logo.png' ./ "$dest/"
  cp "manifest.$browser.json" "$dest/manifest.json"
  echo "Staged $dest/"
done

echo
echo "Chrome:  chrome://extensions -> Developer mode -> Load unpacked -> dist-chrome/"
echo "Firefox: about:debugging#/runtime/this-firefox -> Load Temporary Add-on -> dist-firefox/manifest.json"
