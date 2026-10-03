# Shared tool icons (`packages/icons/tools`)

Monochrome tool icons drawn with `currentColor`, so each app colours them from
CSS (`color:`), e.g. idle grey and accent when active, instead of the
hardcoded `#CCCCCC` / invert-filter approach used today.

Sources: Studio's icons (`apps/studio/images/icons`), except **Selection** and
**Direct Selection**, which come from Vector (`apps/vector/images/select.svg`,
`direct_select.svg`). Colours were normalised to `currentColor`, and XML
prologs and comments were removed.

| Icon | Source |
|------|--------|
| selection.svg | Vector select.svg |
| direct-selection.svg | Vector direct_select.svg |
| pen.svg, text.svg, rectangle.svg, ellipse.svg, polygon.svg, star.svg, pencil.svg | Studio (same names) |
| eyedropper.svg | Studio pick_color.svg |
| eraser.svg | Studio erase.svg |
| hand.svg | Studio pan.svg |

Copy step: `npm run build:icons` (`packages/icons/scripts/copy-tools.mjs`) writes
`apps/vector/images/tools/` and `apps/studio/images/tools/` (copies committed;
`build-site.sh` re-runs it; `npm test` fails if a copy is stale).

**Status: staged, not yet adopted.** Both apps load tool icons in ways where
`currentColor` cannot reach the SVG: Studio uses `background-image` plus an
`invert()` filter, and Vector's toolbar uses SVG-Edit `<se-button src>` image
files with `#CCCCCC` baked in. Next steps:
1. Studio: switch `.sidebar_left .<tool>:after` from `background-image` to
   `mask-image: url(../images/tools/<name>.svg)` + `background-color: currentColor`,
   and drop the invert filter for those tools. Check idle/hover/active colours.
2. Vector: point the se-button `src` for these tools at `images/tools/*` and
   render them as masks (or inline SVG) in the Visteras toolbar CSS so they
   follow `color`, idle `#CCCCCC`, active `--visteras-accent`.
3. Add the remaining shared tools (zoom, line, fill, shape builder, …) once 1–2 land.
