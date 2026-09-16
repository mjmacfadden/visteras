# `@visteras/fonts`

Shared typeface catalog and browser font loading for **Visteras Studio** and **Visteras Vector**.

Both apps should consume this package so the default picker list, naming, and Google load path stay in sync. Do not duplicate `DEFAULT_FONTS` in app code.

## Public API

```js
import {
  DEFAULT_FONTS,
  DEFAULT_FONT_FAMILY,
  SYSTEM_FONT_FAMILIES,
  listDefaultFontFamilies,
  listGoogleCacheFamilies,
  getGoogleFontsCache,
  loadGoogleFontsCache,
  findGoogleFontEntry,
  loadFontFamily,
  formatWeightLabel,
  styleNameToCssWeight,
  weightLabelBase,
  inferFontSource,
  isSystemFontFamily,
} from '@visteras/fonts';
```

### Catalog

- `DEFAULT_FONTS` — same order/names as Studio’s historic `config.FONTS`
- `DEFAULT_FONT_FAMILY` — `"Roboto"`
- `getGoogleFontsCache()` / `loadGoogleFontsCache()` — bundled `data/google-fonts-cache.json`

### Loading

```js
await loadFontFamily({ family: 'Roboto' });                 // Google (default for non-system)
await loadFontFamily({ family: 'Arial', source: 'system' }); // no-op success / local if granted
```

`loadFontFamily` is framework-agnostic (uses `FontFace` / `document.fonts` + Google Fonts CSS). It does not depend on Node APIs or webfontloader.

### Weights

`formatWeightLabel('Light')` → `"Light (300)"`; `styleNameToCssWeight('Bold')` → `"700"`.

## Consumers

| App | How |
|-----|-----|
| **Studio** | Webpack alias `@visteras/fonts` → `packages/fonts/src/index.js` |
| **Vector** | Built ESM at `apps/vector/lib/visteras-fonts.js` (`npm run build:vector` in this package) |

## Build Vector bundle

```bash
npm run build:vector --prefix packages/fonts
```

Copies a browser-ready ESM bundle (JSON inlined) to `apps/vector/lib/visteras-fonts.js`.

## Notes

- IndexedDB / localStorage keys such as `photochop_*` stay owned by Studio; this package does not rename them.
- Full Studio font dialog / weight UI is out of scope for the first shared slice.
