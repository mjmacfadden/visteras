# Visteras

Visteras is a client-side browser creative suite. Your files stay on your device.

This repository is a **monorepo**:

```
apps/studio/   # Visteras Studio — raster image editor (PSD-capable)
apps/vector/   # Visteras Vector — SVG-Edit companion
packages/      # Future shared libraries (placeholder)
docs/          # Product / engineering notes
scripts/       # build-site.sh — assemble publish tree
site/          # GENERATED (gitignored) — GitHub Pages publish root
```

| Repo path       | Public URL                         |
|-----------------|------------------------------------|
| `apps/studio/`  | https://visteras.com/studio/       |
| `apps/vector/`  | https://visteras.com/vector/       |

Architecture only for now — **no Studio ↔ Vector document compatibility**.

## Based on miniPaint / SVG-Edit

Studio is a heavily forked descendant of miniPaint by Vilius L. (MIT License).
Upstream: https://github.com/viliusle/miniPaint

Vector is built on SVG-Edit (companion under `apps/vector`).

## Run locally

From the repo root (after `npm install` inside each app that needs deps):

```bash
# Studio (webpack)
npm install --prefix apps/studio
npm run dev:studio      # webpack-dev-server; opens /studio/; Vector at /vector/
npm run build:studio    # production -> apps/studio/dist/

# Vector (static SVG-Edit; no compile step)
npm run dev:vector      # static server on :5173
npm run build:vector    # no-op (already static)
```

Local `npm run dev:studio` mirrors production paths: Studio at `/studio/`, Vector at `/vector/` (static mounts). Root `/` redirects to `/studio/`.

You can also `cd apps/studio` and use `npm run server` / `npm run build` directly.

## Publish site (`site/`)

Production should serve **`/studio/`** and **`/vector/`** on `visteras.com` — **not** `/apps/studio`.

```bash
npm run build:site    # builds Studio, then writes site/
```

`scripts/build-site.sh` generates:

```
site/
  CNAME                 # visteras.com
  index.html            # hub + redirect to /studio/
  studio/               # Studio static tree (index, dist, images, SW, …)
  vector/               # Vector static tree (Editor.js kept; *.map excluded)
```

`site/` is **gitignored**. Commit the build script + docs; generate `site/` when publishing.

### GitHub Pages

Point Pages at the **`site/`** folder (or a workflow that runs `npm run build:site` and deploys `site/`). Until Pages / Actions is reconfigured to publish `site/`, production still needs that publish step after each release build.

Apex CNAME (`visteras.com`) lives in `site/CNAME` (also historically in `apps/studio/CNAME` for the pre-monorepo layout).

Studio currently commits `dist/` so static hosting can work without CI; `build:site` still runs a fresh Studio build before copying.

## Privacy

- Pixel data for local files stays in the browser.
- Optional third-party APIs only run if you supply keys locally — see `apps/studio/src/js/config.js`.
- Do not commit third-party service keys.

## Docs

- Product / engineering roadmap: `docs/VANTAGE_POINT_ROADMAP.md`
- Security reporting: `SECURITY.md`

## Repository

https://github.com/mjmacfadden/visteras

## License

MIT (upstream miniPaint heritage). New product licensing posture may evolve; see the roadmap IP section and consult counsel before changing distribution terms.
