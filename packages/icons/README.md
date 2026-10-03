# Visteras File Type & App Icons

Official SVG and high-resolution PNG document and application icons for Visteras file types and suites.

## File Types & Color Branding

| Application | File Type | Extension | Primary Gradient | Glow / Accent | File Icon | App Icon |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Visteras Studio** | Studio Document | `.vsd` | `#38bdf8` → `#2563eb` → `#1d4ed8` | `#2563eb` (Blue Glow) | `file-vsd.svg` | `app-vsd.svg` |
| **Visteras Vector** | Vector Document | `.vvd` | `#ff9638` → `#fa7c1b` → `#e06010` | `#fa7c1b` (Orange Glow) | `file-vvd.svg` | `app-vvd.svg` |
| **Visteras Publish** | Publish Document | `.vpd` | `#2dd4bf` → `#14b8a6` → `#0f766e` | `#14b8a6` (Teal Glow) | `file-vpd.svg` | `app-vpd.svg` |
| **Visteras Collage** | Collage Document | `.vcd` | `#c084fc` → `#a855f7` → `#7e22ce` | `#a855f7` (Violet Glow) | `file-vcd.svg` | `app-vcd.svg` |

## Asset Formats
- **Document Icons (`file-*.svg`, `file-*.png`)**: Standard macOS/Windows document page silhouette with top-right folded dog-ear corner, authentic Visteras logo glyph, and integrated bottom brand banner for maximum legibility at small thumbnail sizes (32x32 to 512x512).
- **App Icons (`app-*.svg`, `app-*.png`)**: Modern squircle app container with dark slate chassis, perimeter glass highlight, and centered luminous glowing Visteras logo glyph.

## App Copies
Copies of the respective icons are placed directly into each app's image bundle:
- Studio: `apps/studio/images/file-vsd.{svg,png}`, `apps/studio/images/app-vsd.{svg,png}`
- Vector: `apps/vector/images/file-vvd.{svg,png}`, `apps/vector/images/app-vvd.{svg,png}`
- Publish: `apps/publish/public/images/file-vpd.{svg,png}`, `apps/publish/public/images/app-vpd.{svg,png}`
- Collage: `apps/collage/images/file-vcd.{svg,png}`, `apps/collage/images/app-vcd.{svg,png}`

## Tool icons

`tools/`: shared monochrome tool icons drawn with `currentColor` (Studio source; Selection and Direct Selection from Vector). Copied into apps by `npm run build:icons`. See [tools/README.md](./tools/README.md).
