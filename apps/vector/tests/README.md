# Vector selection regression checks

Run the geometry tests from the repository root:

```sh
node --test apps/vector/tests/path-geometry.test.mjs
```

The native PathData and SVGPathSeg fallback both need coverage: the in-app browser
uses the latter. Pathfinder contours must use absolute coordinates and include
an explicit closing segment before Z for SVGEdit's anchor model.

Browser checks performed against localhost:8081/vector:

- Draw successive rectangles and ellipses; the drawing tool and toolbar stay active.
- Click without dragging with Rectangle; it stays active. Close a Pen path; Pen stays active.
- Select multiple shapes with Cmd+A or Shift-click; a shared box has eight resize handles and rotation.
- Resize/rotate both shapes, then Cmd+Z / Cmd+Shift+Z; geometry is restored in one step.
- Unite overlapping rectangles, immediately press A: all eight anchors match the outline, including the closing corner.
- Click one anchor then drag, nudge by 1 / Shift+10, delete it, and undo/redo.
- At 125% zoom, a 25-pixel anchor drag moves 20 document units.
- Repeated clicks with V stay in Selection; A can be pressed again without hiding anchors.
- Direct Selection can target a shape inside a group.
- V/A/M/L/P/N/T/Z/I/H/backslash select the matching toolbar tools; Space restores the previous tool.

Remaining scope: SVGEdit still edits one path at a time; simultaneous anchor
editing across separate objects and Illustrator's full live-shape/modifier
behavior are not implemented by this change. The alternate iife-index.html
entry point is not updated; the main Vector app loads Editor.js as an ES module.

## Shape Builder, Eyedropper, Offset Path, Align (app/vector/feature/various)

Unit tests: `node --test apps/vector/tests/*.test.mjs` (shape-builder and
eyedropper suites cover the pure helpers with mocks; Paper.js booleans are
exercised in the browser only).

Browser checks (served statically from `apps/`, e.g. `python3 -m http.server 5180`
then http://127.0.0.1:5180/vector/index.html):

- Shape Builder (Shift+M or toolbar): rect+ellipse → 3 hover regions; drag-merge
  = 1 undo step with the current fill; Alt-click/drag deletes; tool stays active;
  works for rotated shapes, shapes in a transformed group, Outside-stroke
  sources and at 150% zoom.
- Eyedropper (I): with a selection, click a shape (incl. one inside a styled
  group, one with style="", or the ring of an Outside stroke) → selection takes
  its appearance in 1 undo step; nothing selected → fill/stroke wells, weight
  and opacity load as defaults; Option-click applies the selection's appearance
  to the clicked shape; hold Cmd → Selection tool until released; empty canvas
  → no-op.
- ⌥⌘O opens Offset Path on a Mac keyboard (matches `e.code === 'KeyO'`).
- Align & Distribute shows for one object (aligns to the artboard, distribute
  disabled) and for 2+ (Align To dropdown); each click = one undo step.
