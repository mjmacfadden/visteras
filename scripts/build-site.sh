#!/usr/bin/env bash
# Assemble the GitHub Pages / static publish tree under site/.
# Repo layout stays apps/studio + apps/vector + apps/publish + apps/collage; public URLs are /studio/, /vector/, /publish/, and /collage/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="$ROOT/site"
STUDIO="$ROOT/apps/studio"
VECTOR="$ROOT/apps/vector"
PUBLISH="$ROOT/apps/publish"
COLLAGE="$ROOT/apps/collage"

copy_tree() {
  # copy_tree <src_dir> <dest_dir> [--exclude pattern ...]
  local src="$1" dest="$2"
  shift 2
  mkdir -p "$dest"
  if command -v rsync >/dev/null 2>&1; then
    local args=(-a)
    while [[ $# -gt 0 ]]; do
      if [[ "$1" == "--exclude" ]]; then
        args+=(--exclude "$2")
        shift 2
      else
        shift
      fi
    done
    rsync "${args[@]}" "$src"/ "$dest"/
  else
    # Portable fallback when rsync is missing (e.g. minimal Linux boxes)
    local excludes=()
    while [[ $# -gt 0 ]]; do
      if [[ "$1" == "--exclude" ]]; then
        excludes+=(--exclude="$2")
        shift 2
      else
        shift
      fi
    done
    # trailing /. copies contents; excludes are tar --exclude patterns (no leading ./ required)
    tar -C "$src" "${excludes[@]}" -cf - . | tar -C "$dest" -xf -
  fi
}

echo "==> Building shared fonts bundle for Vector & Collage"
npm run build:vector --prefix "$ROOT/packages/fonts"

echo "==> Building Studio (apps/studio → dist/)"
npm run build --prefix "$STUDIO"

echo "==> Building Publish (apps/publish → dist/)"
ASTRO_BASE="/publish/" npm run build --prefix "$PUBLISH"

echo "==> Preparing site/"
rm -rf "$SITE"
mkdir -p "$SITE/studio" "$SITE/vector" "$SITE/publish" "$SITE/collage"

# Apex CNAME for visteras.com (GitHub Pages custom domain)
printf '%s\n' 'visteras.com' > "$SITE/CNAME"

# Keep homepage source outside the generated site tree.
copy_tree "$ROOT/apps/home" "$SITE"

echo "==> Copying Studio static tree → site/studio/"
# Static hosting needs: index, dist, images, SW, manifests, tools/examples if referenced.
# Exclude node_modules, src, archived, webpack, package files, scripts.
copy_tree "$STUDIO" "$SITE/studio" \
  --exclude 'node_modules' \
  --exclude 'dist/ort-*.wasm' \
  --exclude 'ort-*.wasm' \
  --exclude '.git' \
  --exclude 'src' \
  --exclude 'archived' \
  --exclude 'scripts' \
  --exclude 'webpack.config.js' \
  --exclude 'package.json' \
  --exclude 'package-lock.json' \
  --exclude 'PERFORMANCE.md' \
  --exclude 'CNAME'

echo "==> Copying Vector static tree → site/vector/"
# Keep Editor.js; drop huge source maps (optional size save).
copy_tree "$VECTOR" "$SITE/vector" \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '*.map'

echo "==> Copying Publish dist tree → site/publish/"
copy_tree "$PUBLISH/dist" "$SITE/publish"

echo "==> Copying Collage static tree → site/collage/"
copy_tree "$COLLAGE" "$SITE/collage" \
  --exclude '.git' \
  --exclude 'node_modules'

echo "==> site/ ready"
echo "    Publish this folder to GitHub Pages (Actions or manual gh-pages)."
echo "    Public URLs: https://visteras.com/studio/ , https://visteras.com/vector/ , https://visteras.com/publish/ , and https://visteras.com/collage/"
du -sh "$SITE" "$SITE/studio" "$SITE/vector" "$SITE/publish" "$SITE/collage"
