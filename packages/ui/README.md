# @visteras/ui

Shared UI kit for the Visteras apps. Adopted incrementally; it never rewrites an
app's core. Each app keeps its own accent colour and file type:

| App | Accent (`--visteras-accent`) | File type |
|-----|------------------------------|-----------|
| Vector | orange (`--studio-orange`) | `.vvd` |
| Studio | blue | `.vsd` |
| Publish | teal (`--news-teal`) | `.vpd` |
| Collage | purple (`--collage-purple`) | `.vcd` |
| Inspire | amber (`--inspire-amber`) | `.vid` |

Components read the accent from the app's CSS variables (`--visteras-accent`,
optional `--visteras-accent-hover`, `--visteras-on-accent`). The kit never
hardcodes an accent colour.

## Modules (`src/`)

| File | Exports |
|------|---------|
| `toast.js` | `showToast(message, type, duration)` with alertify-compatible markup, so each app's existing toast CSS still applies |
| `dialog.js` | `showConfirmDialog(opts)`, `showUnsavedChangesDialog(title)` (Studio wording, Cancel focused) |
| `escape.js` | `escapeHtml` |
| `ui.css` | dialog styles (tokens + `--visteras-accent`) |

## How apps get it (copy-at-build, same as `tool-free.js` / `@visteras/fonts`)

- **Static apps** (Vector, Inspire, Collage): `npm run build:ui` copies `src/*`
  into `apps/<app>/lib/visteras-ui/` with a "generated, do not edit" banner.
  The copies are committed, so the per-app dev servers (`npm run dev:vector`,
  `dev:inspire`, `dev:collage`, Live Server, `python3 -m http.server` on `apps/`)
  work without a build step. `scripts/build-site.sh` re-runs the copy before
  assembling `site/`.
- **Studio** (webpack): the alias `@visteras/ui` resolves to `packages/ui/src`
  (like `@visteras/fonts`), so `npm run dev:studio` / `build:studio` use the
  source directly.
- `npm test` (suite `ui`) runs the package tests and fails if a copy is stale
  (`build-static.mjs --check`).

Edit `packages/ui/src`, then run `npm run build:ui`.
