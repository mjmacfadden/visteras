# PDF export libraries (Vector)

Vendored for File ▸ Export As… ▸ PDF (Illustrator-style, one page per artboard, real vectors).

| File | Package | Why |
|---|---|---|
| `jspdf.umd.min.js` | jsPDF 2.5.2 | Client-side PDF writer. Already bundled inside `Editor.js` (4.2.1) but that copy is not exported to our ESM modules, so we vendor a small UMD build we can load on demand. |
| `svg2pdf.umd.min.js` | svg2pdf.js 2.2.4 | Draws an SVG element into a jsPDF document as vectors/text (not a raster). Registers `jsPDF.API.svg`. |

Both are MIT-licensed. Loaded lazily the first time the user exports a PDF (see `js/visteras-export-pdf.js`), so they do not cost startup.
