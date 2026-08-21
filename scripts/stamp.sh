#!/usr/bin/env bash
# Stamp dist/ with a build id derived from main.wasm.
#
# Two jobs:
#
#  1. wasm_exec.js and main.wasm are a matched pair and must never be served
#     from cache in mismatched versions.
#  2. A CDN sitting in front of a stable path keeps serving the previous copy
#     until it expires. Giving every internal reference a build-keyed query
#     makes each deploy a new cache key, so a fresh page can never pull a
#     stale module. This is what lets a deploy take effect without a purge.
#
# Usage: scripts/stamp.sh <dist-dir> <wasm-file>
set -euo pipefail

DIST="${1:-dist}"
WASM="${2:-main.wasm}"

BUILD=$( { sha256sum "$WASM" 2>/dev/null || shasum -a 256 "$WASM"; } | cut -c1-12 )
[ -n "$BUILD" ] || { echo "could not hash $WASM" >&2; exit 1; }

# sed -i differs between GNU and BSD; the .bak suffix works on both.
sedi() { sed -i.bak "$@" && rm -f "${@: -1}.bak"; }

# The placeholder bench.js carries for the wasm and shim URLs.
sedi "s/__BUILD__/$BUILD/g" "$DIST/js/bench.js"

# Entry points referenced from HTML.
for f in "$DIST/index.html" "$DIST/projects/index.html" "$DIST/writing/index.html"; do
  [ -f "$f" ] || continue
  sedi "s|/js/site\.js|/js/site.js?v=$BUILD|g; s|/css/styles\.css|/css/styles.css?v=$BUILD|g" "$f"
done

# Stylesheet import.
sedi "s|url('fonts\.css')|url('fonts.css?v=$BUILD')|g" "$DIST/css/styles.css"

# ES module imports, which resolve relative to the importing file.
for m in experiments bench edge headers; do
  sedi "s|'\./$m\.js'|'./$m.js?v=$BUILD'|g" "$DIST/js/site.js"
done
sedi "s|'\./sha256\.js'|'./sha256.js?v=$BUILD'|g" "$DIST/js/bench.js"

if grep -rq "__BUILD__" "$DIST"; then
  echo "stamp failed: __BUILD__ still present" >&2
  exit 1
fi

echo "stamped build $BUILD"
