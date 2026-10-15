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
- [ ] 4. Warp Options and live Preview
- [ ] 5. Editing, Reset, Release and Expand
- [ ] 6. Envelope Options
- [ ] 7. Appearance, Layers, export and Studio paste

Next: Stage 4 (Warp Options dialog and live Preview). Stage 2's stub dialog still applies Arc 50 on OK.

Acceptance tests:
- [x] AT1 menu/chord scaffolding (Chrome Mac runtime verified)
- [x] AT2 defaults and Make
- [x] AT3 identity math
- [ ] AT4 golden styles
- [ ] AT5 preview/cancel
- [ ] AT6 history
- [ ] AT7 expand
- [ ] AT8 release
- [ ] AT9 live contents
- [ ] AT10 fidelity (math half done in stage 3: tolerance/nodes/error monotonic; dialog half in stage 6)
- [x] AT11 persistence
- [ ] AT12 export
- [ ] AT13 clipboard
- [ ] AT14 rasters
- [ ] AT15 Appearance/Layers
- [x] H1 hit-testing
- [x] H2 bounds
- [x] H3 Select All
- [ ] H4 export
- [ ] H5 Studio paste
- [ ] H6 cleanup

Decisions: the spec calls for eight menu items but explicitly lists seven commands. Implement the seven named commands in the prescribed order; Reset replaces Make rather than adding an invented eighth command.
