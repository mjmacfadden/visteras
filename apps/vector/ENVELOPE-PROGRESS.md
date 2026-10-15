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
  `visteras-envelope-dialogs.js`: Warp Options (Style dropdown with a warped-grid icon per style, Horizontal/Vertical, Bend and Distortion H/V sliders + clamped % fields, Preview default off, OK/Cancel, Esc/Enter, focus trap, ⌘Z/⌘Y blocked while open). Preview follows the Simplify originals pattern: Make preview builds an envelope without history and reverts the batch; Reset preview keeps the original `-out` node and attributes and puts them back verbatim. OK = one undo step ('Make with Warp' / 'Reset with Warp'); session memory only (also kept after Cancel, per the stage-4 smoke). Reset with Warp opens prefilled with the envelope's params. Properties panel gets an "Envelope" section (Style, H/V, Bend, Distortion H/V, Edit Contents, Envelope Options…) — each change is one undo step ('Envelope Warp'). Symbols toast "Expand the symbol first" from the chord. Catch-up from stage 3: AT4 golden fixtures (`tests/fixtures/envelope/*.svg`, 15 files × 8 cases, tol 0.01 px, regenerate with UPDATE_ENVELOPE_GOLDEN=1) and AT14 (injected fake canvas). Chrome verified: chord opens dialog with defaults, live Flag preview with zero history entries, ⌘Z blocked, Cancel → getSvgString byte-identical and undo pointer unchanged, values remembered, OK = +1 step, panel edit = +1 step, Reset prefilled and +1 step, undo restores.
- [x] 5. Editing, Reset, Release and Expand — commit: this stage commit (resolve with `git log --grep='stage 5'`) — gates: test:vector 820/820, storage 0, build:vector OK, npm test PASS.
  `visteras-envelope-actions.js`. Edit Contents sets `data-visteras-envelope-editing` (a stylesheet rule swaps `-src`/`-out`, beating the presentation attributes) and isolates `-src` with SVG-Edit's `setContext` (same as symbol editing); H1–H3 are lifted only for that envelope (`isEnvelopeSource` honours the flag). Edit Envelope (menu, Properties button, or leaving the isolation) refits the bbox to the edited contents and re-renders; each toggle is one undo step. Reset with Warp = stage-4 dialog prefilled. Release: contents back at the envelope's z-order, wrapper/envelope transforms folded into each child, plus one grey (#cccccc, decision) warped-shape path; wrappers vanish. Expand (Envelope Distort and Object ▸ Expand, which now delegates and joins its batch): fresh-id copy of the rendered `-out` in a `<g>` named "Envelope", no envelope attributes, unused clipPaths swept. Undo/redo now re-render stale envelopes via the 'changed' event. Object ▸ Expand's commit check also accepts BatchCommand `stack`/`isEmpty()` (it only looked at `sub_commands`). Chrome verified: text warp → Edit Contents (src shown, out hidden, isolated, click hits the live text, label Edit Envelope) → change string → Edit Envelope (outlines re-rendered, bbox refit) → Reset Bulge → undo re-renders Arc → Release (text + grey path, no hidden leftovers, 1 step) → undo → Expand (only paths, named Envelope) → undo → Object ▸ Expand (1 step).
- [ ] 6. Envelope Options
- [ ] 7. Appearance, Layers, export and Studio paste

Next: Stage 6 (Envelope Options).

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
- [ ] AT10 fidelity (math half done in stage 3: tolerance/nodes/error monotonic; dialog half in stage 6)
- [x] AT11 persistence
- [ ] AT12 export
- [ ] AT13 clipboard
- [x] AT14 rasters
- [ ] AT15 Appearance/Layers
- [x] H1 hit-testing
- [x] H2 bounds
- [x] H3 Select All
- [ ] H4 export
- [ ] H5 Studio paste
- [ ] H6 cleanup

Decisions: the spec calls for eight menu items but explicitly lists seven commands. Implement the seven named commands in the prescribed order; Reset replaces Make rather than adding an invented eighth command.
