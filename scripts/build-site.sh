#!/usr/bin/env bash
# Assemble the GitHub Pages / static publish tree under site/.
# Repo layout stays apps/studio + apps/vector; public URLs are /studio/ and /vector/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="$ROOT/site"
STUDIO="$ROOT/apps/studio"
VECTOR="$ROOT/apps/vector"

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

echo "==> Building Studio (apps/studio → dist/)"
npm run build --prefix "$STUDIO"

echo "==> Preparing site/"
rm -rf "$SITE"
mkdir -p "$SITE/studio" "$SITE/vector"

# Apex CNAME for visteras.com (GitHub Pages custom domain)
printf '%s\n' 'visteras.com' > "$SITE/CNAME"

# Simple hub at / — links to the two apps
cat > "$SITE/index.html" << 'HTML'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Visteras</title>
  <meta http-equiv="refresh" content="0; url=/studio/" />
  <link rel="canonical" href="https://visteras.com/studio/" />
  <style>
    body { font-family: system-ui, sans-serif; max-width: 36rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5; }
    a { color: #2f6fae; }
  </style>
</head>
<body>
  <h1>Visteras</h1>
  <p>Client-side creative suite. Your files stay on your device.</p>
  <ul>
    <li><a href="/studio/">Studio</a> — raster image editor</li>
    <li><a href="/vector/">Vector</a> — SVG editor</li>
  </ul>
  <p><noscript>JavaScript is off — open <a href="/studio/">/studio/</a> or <a href="/vector/">/vector/</a>.</noscript></p>
</body>
</html>
HTML

echo "==> Copying Studio static tree → site/studio/"
# Static hosting needs: index, dist, images, SW, manifests, tools/examples if referenced.
# Exclude node_modules, src, archived, webpack, package files, scripts.
copy_tree "$STUDIO" "$SITE/studio" \
  --exclude 'node_modules' \
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

echo "==> site/ ready"
echo "    Publish this folder to GitHub Pages (Actions or manual gh-pages)."
echo "    Public URLs: https://visteras.com/studio/  and  https://visteras.com/vector/"
du -sh "$SITE" "$SITE/studio" "$SITE/vector"
