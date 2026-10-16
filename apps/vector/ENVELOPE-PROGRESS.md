## ENVELOPE-PROGRESS

Base: master `d65d88f91e90fc78d2b23789512de3ec63d72674` (2026-10-15).
Branch: `app/vector/feature/envelope-warp`. No merge or PR authorized.
Baseline: Vector 765/765, 0 skipped; storage 0 violations (70 writes, 66 allowed, 4 known outside Vector); build:vector OK; npm test PASS all seven gates (Studio 299 pass / 1 skipped).

- [x] 1. Menu and shortcut scaffolding — commit: this stage commit (resolve with `git log --grep='stage 1'`) — gates: test:vector 768/768, storage 0, build:vector OK, npm test PASS.
  Chrome on Mac: rectangle selected → ⌥⇧⌘W opens Warp Options with Cancel. Other browsers not verified. Triple-modifier Windows labels normalized to Ctrl+Alt+Shift by shared formatter; key matching unchanged.
- [x] 2. Envelope object model and storage — commit: this stage commit (resolve with `git log --grep='stage 2'`) — gates: test:vector 778/778, storage 0, build:vector OK, npm test PASS.
  `visteras-envelope-core.js` (normalize/read/isEnvelope/isEnvelopeSource/canEnvelope/hash) and `visteras-envelope-model.js` (makeEnvelope as one BatchCommand 'Make with Warp', identity `-out` clone with remapped ids, refresh-on-load when stale). Layers shows `<Envelope>` with a collapsed Contents row; Select All / marquee / click skip `-src`. Hash ignores ids and pointer-events styles that SVG-Edit adds on load (otherwise every reopen looked stale). Fixed a master bug: Edit ▸ Select All called the non-existent `sc.selectAllElements` and did nothing. Chrome (Mac) verified with a displaced `-out`: click on hidden source selects nothing, click on output selects the envelope, marquee over source selects nothing, ⌘A and Edit ▸ Select All select the envelope once, getStrokedBBox/getBBox/handles equal `-out`, save→reopen keeps params and output, stale source rebuilds `-out`. (Same-layer limitation lifted in stage 3.)
- [x] 3. Warp math, subdivision and raster rendering — commit: this stage commit (resolve with `git log --grep='stage 3'`) — gates: test:vector 789/789, storage 0, build:vector OK, npm test PASS.
  `visteras-envelope-warp.js`: warpPoint for all 15 styles (distortion first, Vertical by axis swap, zero-size bbox padded), full path parser (M L H V C S Q T A Z → cubics, arcs split), shape→path, transform matrices, adaptive subdivision with tol = diag·10^(−1−3·fid/100), depth 1…10 (implicit closing edges warped too). `visteras-envelope-raster.js`: triangle mesh warp (8…64 cells by fidelity). `visteras-envelope-render.js`: builds `-out` — shapes become warped paths, group transforms baked, stroke widths scaled, text outlined via the existing opentype converter (falls back to live unwarped text flagged `data-visteras-envelope-unwarped="font"`), images rasterised through the mesh with a warped clipPath when Preserve Shape = Clipping Mask, clip-paths warped. Rendering is async and token-guarded; `-out` is derived so it is swapped outside history. Same-layer limitation lifted: Make accepts objects from different layers/groups; the envelope goes where the topmost object was and foreign objects are wrapped in a `data-visteras-envelope-wrap` matrix so nothing moves (one undo step; undo restores original parents). Chrome verified: rect + circle in a scaled group + text + image across parents → arc 50 output, selection handles follow the output, one undo step, undo/redo exact. Decision: Arc uses a true circular arc at every bend.
- [x] 4. Warp Options and live Preview — commit: this stage commit (resolve with `git log --grep='stage 4'`) — gates: test:vector 813/813, storage 0, build:vector OK, npm test PASS.
  `visteras-envelope-dialogs.js`: Warp Options (Style dropdown with a warped-grid icon per style, Horizontal/Vertical, Bend and Distortion H/V sliders + clamped % fields, Preview on every time the dialog opens (not remembered), OK/Cancel, Esc/Enter, focus trap, ⌘Z/⌘Y blocked while open). Preview follows the Simplify originals pattern: Make preview builds an envelope without history and reverts the batch; Reset preview keeps the original `-out` node and attributes and puts them back verbatim. OK = one undo step ('Make with Warp' / 'Reset with Warp'); session memory only (also kept after Cancel, per the stage-4 smoke). Reset with Warp opens prefilled with the envelope's params. Properties panel gets an "Envelope" section (Style, H/V, Bend, Distortion H/V, Edit Contents, Envelope Options…) — each change is one undo step ('Envelope Warp'). Symbols toast "Expand the symbol first" from the chord. Catch-up from stage 3: AT4 golden fixtures (`tests/fixtures/envelope/*.svg`, 15 files × 8 cases, tol 0.01 px, regenerate with UPDATE_ENVELOPE_GOLDEN=1) and AT14 (injected fake canvas). Chrome verified: chord opens dialog with defaults, live Flag preview with zero history entries, ⌘Z blocked, Cancel → getSvgString byte-identical and undo pointer unchanged, values remembered, OK = +1 step, panel edit = +1 step, Reset prefilled and +1 step, undo restores.
- [x] 5. Editing, Reset, Release and Expand — commit: this stage commit (resolve with `git log --grep='stage 5'`) — gates: test:vector 820/820, storage 0, build:vector OK, npm test PASS.
  `visteras-envelope-actions.js`. Edit Contents sets `data-visteras-envelope-editing` (a stylesheet rule swaps `-src`/`-out`, beating the presentation attributes) and isolates `-src` with SVG-Edit's `setContext` (same as symbol editing); H1–H3 are lifted only for that envelope (`isEnvelopeSource` honours the flag). Edit Envelope (menu, Properties button, or leaving the isolation) refits the bbox to the edited contents and re-renders; each toggle is one undo step. Reset with Warp = stage-4 dialog prefilled. Release: contents back at the envelope's z-order, wrapper/envelope transforms folded into each child, plus one grey (#cccccc, decision) warped-shape path; wrappers vanish. Expand (Envelope Distort and Object ▸ Expand, which now delegates and joins its batch): fresh-id copy of the rendered `-out` in a `<g>` named "Envelope", no envelope attributes, unused clipPaths swept. Undo/redo now re-render stale envelopes via the 'changed' event. Object ▸ Expand's commit check also accepts BatchCommand `stack`/`isEmpty()` (it only looked at `sub_commands`). Chrome verified: text warp → Edit Contents (src shown, out hidden, isolated, click hits the live text, label Edit Envelope) → change string → Edit Envelope (outlines re-rendered, bbox refit) → Reset Bulge → undo re-renders Arc → Release (text + grey path, no hidden leftovers, 1 step) → undo → Expand (only paths, named Envelope) → undo → Object ▸ Expand (1 step).
- [x] 6. Envelope Options — commit: this stage commit (resolve with `git log --grep='stage 6'`) — gates: test:vector 826/826, storage 0, build:vector OK, npm test PASS.
  Envelope Options dialog (Rasters: Anti-Alias, Preserve Shape Using Clipping Mask / Transparency; Fidelity 0–100; Distort Appearance; Distort Linear Gradients and Distort Pattern Fills shown disabled "Coming later"). Envelope selected (or being edited): OK = one undo step 'Envelope Options' and re-render; nothing selected: OK sets the in-memory defaults for the next Make (no history, no storage). Distort Appearance on (default): strokes are outlined with the same Paper.js outline as Outline Stroke (loaded lazily) and warped as filled shapes grouped with the fill; off: the warped path keeps a uniform stroke. Deferred: expanding `data-visteras-fx` effects before warping — effects are SVG filters and still apply on top of the warped result in both modes (rasterising them would be needed; follow-up). Chrome verified: thick-stroked circle + Inflate → outlined stroke group; Options Fidelity 100 + Appearance off → 1 step, 8→24 curve nodes, uniform 24px stroke; defaults with nothing selected → next Make gets Fidelity 20.
- [x] 7. Appearance, Layers, export and Studio paste — commit: this stage commit (resolve with `git log --grep='stage 7'`) — gates: test:vector 830/830, storage 0, build:vector OK, npm test PASS.
  Appearance shows **Envelope** (style name; click = Reset with Warp…) and a **Contents** link (runs Edit Contents), then effects and Opacity; Layers shows `<Envelope>` with the Contents row. `visteras-envelope-export.js` `envelopeOutputOnly()` strips `-src` and every `data-visteras-envelope*` attribute; called in `buildExportSvg` (SVG/PNG/JPG/PDF, before text outlining and the selection prune), in the SVG-Edit-serializer artboard path, and on each clone in `serializeSelectedToSvg` (Studio clipboard). Export/clipboard bounds already come from the envelope's bbox, which is `-out` (H2). Chrome verified with Flag 100 (source 200,200 300×80 vs output 200,160 300×160): selection SVG viewBox = output bounds, no source ids/text/attributes; artboard SVG clean; PNG 300×160 with no source pixels; PDF valid with no leak; Studio clipboard SVG = 5 warped paths, viewBox 300×160; Appearance rows Envelope/Contents/Opacity, Contents link enters Edit Contents; Vector→Vector ⌘C/⌘V keeps a full editable envelope (SVG-Edit's internal clipboard).

Next: Mike's smoke test (see the PR body). Nothing merges before that.

Acceptance tests:
- [x] AT1 menu/chord scaffolding (Chrome Mac runtime verified)
- [x] AT2 defaults and Make
- [x] AT3 identity math
- [x] AT4 golden styles
- [x] AT5 preview/cancel
- [x] AT6 history
- [x] AT7 expand
- [x] AT8 release
- [x] AT9 live contents
- [x] AT10 fidelity
- [x] AT11 persistence
- [x] AT12 export
- [x] AT13 clipboard
- [x] AT14 rasters
- [x] AT15 Appearance/Layers
- [x] H1 hit-testing
- [x] H2 bounds
- [x] H3 Select All
- [x] H4 export
- [x] H5 Studio paste
- [x] H6 cleanup

Decisions: the spec calls for eight menu items but explicitly lists seven commands. Implement the seven named commands in the prescribed order; Reset replaces Make rather than adding an invented eighth command.

## Post-smoke fixes (Mike, c676bfba)
- [x] F1 multi-object warp: one grid over the combined bounds. Root cause: the text's own transform was applied twice (the render matrix already had it, and Create Outlines copies it onto the outline group), so resized text grew and ran outside the grid.
- [x] F2 Warp Options: draggable title bar, opens clear of the artwork, no overlay hiding the canvas, live Preview on slider input and typed numbers. Root cause: the dialog sat centred on a 45% black full-screen overlay and had no drag handle. Also fixed: Esc right after typing a number left the preview behind, because the removed field's late 'change' re-created the preview.
- [x] F3 text alone: the envelope uses the glyphs' visual (ink) bounds, not the line-height/advance box. Root cause: boundsIn used text getBBox(), which is the line box (font ascent+descent, plus advances and trailing tracking). The warp grid now spans the letters only; Edit Envelope refits the same way.
- [x] F4 Preview opens ticked in Warp Options every time, so the warp shows straight away. It is not stored anywhere; the other values are still remembered for the session. Esc/Cancel straight after opening leaves the file byte-identical with nothing to undo. Envelope Options has no Preview, so it is unchanged.

## Object ▸ Expand… (Illustrator)
- [x] E1 Audit and reuse:
  - Envelope Distort ▸ Expand (`expandEnvelope`, joined into the same batch).
  - Create Outlines (`convertTextToOutlines`).
  - Outline Stroke. It already existed (`executeOutlineStroke` in `visteras-offset-path.js`, Paper.js). Its core is now `outlineStrokeLeaves(sc, leaves, batch)`, shared by Outline Stroke and Expand.
  - Break Link (`breakLinkToSymbol`).
  - Shape-to-path (`shapeToPathData`). svgedit's `convertToPath` records its own undo step, so Expand doesn't use it any more.
  - Expand Appearance didn't exist anywhere.
- [x] E2 Menu: Object ▸ Expand… with Expand Appearance directly below it, no shortcuts. Expand… is greyed out when nothing expandable is selected, and refreshes when the menu opens. Expand Appearance is shown greyed out ("Coming later"), because Vector has nothing to expand there yet: effects are SVG filters, and envelopes use Expand.
- [x] E3 Dialog: Object / Fill / Stroke, OK / Cancel. Same movable box as Warp Options, transparent modal layer. Checkboxes that don't apply are disabled; envelope-only gives Object only.
- [x] E4 Behaviour, all one undo step ('Expand') with no hidden originals left:
  - Envelope: same as Envelope Distort ▸ Expand.
  - Text: outlines.
  - Symbol: Object breaks the link; Fill/Stroke then also apply to its artwork.
  - Stroke: filled outline paths.
  - Fill: primitives become paths with the same paint.
- [x] Also fixed: the old Expand recorded two or three undo steps (convertToPath and Outline Stroke each added their own).

## Properties ▸ Envelope cleanup (Mike, 5d9aab32)
- [x] U1 The inline Style / Horizontal-Vertical / Bend / H / V controls are removed from Properties, together with their wiring (`updateEnvelope` 'Envelope Warp') and tests. Envelopes are edited in Warp Options, which opens on an existing envelope from Properties ▸ Warp Options… or from Object ▸ Envelope Distort ▸ Reset with Warp… (also ⌥⇧⌘W). It shows the current settings with Preview on, in the movable non-dimming box. OK is one undo step; Esc/Cancel leaves the file byte-identical with nothing to undo.
- [x] U2 The Envelope section is one left-aligned row of the shared `.vui-icon-group` / `.vui-icon-btn` buttons (28×24, 2px gap, same as Align/Pathfinder/Actions), with icons and tooltips: Warp Options…, Edit Contents (aria-pressed, "Edit Envelope" while editing), Envelope Options….
- [x] U3 Double-click follows Illustrator: double-clicking an envelope with the Selection tool enters isolation on its contents (Edit Contents), not Warp Options. Esc exits back to the envelope. Edit Contents now selects the contents (as Illustrator does), so Properties stays visible with "Edit Envelope".
- Expand Appearance stays greyed out.
