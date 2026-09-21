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
