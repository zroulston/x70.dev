#!/usr/bin/env bash
# Stamp dist/ with a build id derived from the published tree.
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
# Usage: scripts/stamp.sh <dist-dir>
set -euo pipefail

DIST="${1:-dist}"

sha() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }

# The build id covers every published file, not just main.wasm.
#
# Hashing the wasm alone was enough to keep it paired with its shim, but it
# could not notice a change that never touches the binary -- a new image, a CSS
# tweak -- so those shipped with an unchanged id, kept their old cache key, and
# sat behind the CDN's max-age until it expired. Hashing the tree means any
# change at all mints a new set of keys, and the wasm/shim pairing still holds
# because a new binary is also a new tree.
#
# Computed before stamping, since stamping rewrites the files it just read.
BUILD=$(
  find "$DIST" -type f | LC_ALL=C sort | while IFS= read -r f; do sha "$f"; done | sha | cut -c1-12
)
[ -n "$BUILD" ] || { echo "could not hash $DIST" >&2; exit 1; }

# sed -i differs between GNU and BSD; the .bak suffix works on both.
sedi() { sed -i.bak "$@" && rm -f "${@: -1}.bak"; }

# The placeholder bench.js carries for the wasm and shim URLs.
sedi "s/__BUILD__/$BUILD/g" "$DIST/js/bench.js"

# Entry points referenced from HTML.
for f in "$DIST/index.html" "$DIST/projects/index.html" "$DIST/writing/index.html"; do
  [ -f "$f" ] || continue
  sedi "s|/js/site\.js|/js/site.js?v=$BUILD|g; s|/css/styles\.css|/css/styles.css?v=$BUILD|g" "$f"
  # Images are referenced by a stable path and served with a long max-age, so
  # they need the same treatment. Only the same-origin src is rewritten -- the
  # absolute og:image/twitter:image URLs stay stable for social crawlers.
  sedi "s|src=\"/images/\([^\"?]*\)\"|src=\"/images/\1?v=$BUILD\"|g" "$f"
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
