## ENVELOPE-PROGRESS

Base: master `d65d88f91e90fc78d2b23789512de3ec63d72674` (2026-10-15).
Branch: `app/vector/feature/envelope-warp`. No merge or PR authorized.
Baseline: Vector 765/765, 0 skipped; storage 0 violations (70 writes, 66 allowed, 4 known outside Vector); build:vector OK; npm test PASS all seven gates (Studio 299 pass / 1 skipped).

- [x] 1. Menu and shortcut scaffolding — commit: this stage commit (resolve with `git log --grep='stage 1'`) — gates: test:vector 768/768, storage 0, build:vector OK, npm test PASS.
  Chrome on Mac: rectangle selected → ⌥⇧⌘W opens Warp Options with Cancel. Other browsers not verified. Triple-modifier Windows labels normalized to Ctrl+Alt+Shift by shared formatter; key matching unchanged.
- [ ] 2. Envelope object model and storage
- [ ] 3. Warp math, subdivision and raster rendering
- [ ] 4. Warp Options and live Preview
- [ ] 5. Editing, Reset, Release and Expand
- [ ] 6. Envelope Options
- [ ] 7. Appearance, Layers, export and Studio paste

Next: Stage 2. Stage 1 is scaffolding only; Warp Options has no OK yet and does not modify artwork.

Acceptance tests:
- [x] AT1 menu/chord scaffolding (Chrome Mac runtime verified)
- [ ] AT2 defaults and Make
- [ ] AT3 identity math
- [ ] AT4 golden styles
- [ ] AT5 preview/cancel
- [ ] AT6 history
- [ ] AT7 expand
- [ ] AT8 release
- [ ] AT9 live contents
- [ ] AT10 fidelity
- [ ] AT11 persistence
- [ ] AT12 export
- [ ] AT13 clipboard
- [ ] AT14 rasters
- [ ] AT15 Appearance/Layers
- [ ] H1 hit-testing
- [ ] H2 bounds
- [ ] H3 Select All
- [ ] H4 export
- [ ] H5 Studio paste
- [ ] H6 cleanup

Decisions: the spec calls for eight menu items but explicitly lists seven commands. Implement the seven named commands in the prescribed order; Reset replaces Make rather than adding an invented eighth command.
