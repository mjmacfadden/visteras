# Embedded Smart Layers

Smart Layers keep an editable source document separately from each layer's placement,
rotation, mask, opacity, blend mode and supported live effects. All processing and
storage are local to the browser. There are no external file links or uploads.

## Workflow

- Choose **Layer > Smart Layers > Convert to Smart Layer**, or use the Layers context menu.
- Double-click its thumbnail (or choose **Edit Contents**) to open an isolated contents tab.
- Edit with Studio's normal tools. **Save Contents** / Ctrl+S / Cmd+S commits one undoable
  source revision and returns to the parent. Closing dirty contents asks before discarding.
- **Duplicate** shares the source; **Make Independent** detaches the selected instance.
- **Replace Contents** accepts PNG, JPEG and WebP, fitting the replacement within the
  existing source frame without changing instance placement. It updates shared copies.
- **Rasterize Smart Layer** detaches into a regular image while retaining appearance,
  placement, mask and live effects. This is undoable.
- Save **JSON** to retain editability. Raster exports are composites. PSD export bakes
  Smart Layer instances to pixels and displays a notice; it does not create Photoshop
  Smart Object metadata.

Direct pixel modification of Smart Layers is blocked. Paint in their contents, paint
on an instance mask, or rasterize explicitly. Existing live filters remain editable;
other effects are available inside the contents editor or after rasterization.

## Data and history

`config.smart_sources` is scoped to each document alongside its layers and history.
A `type: 'smart'` layer holds `smart_source_id`; its runtime `link` is a shared,
full-source-resolution composite. Sources hold an ID, revision token, dimensions,
serialized native document, PNG composite and runtime canvas/image. JSON's
`smart_sources` table emits each referenced source once, omitting instance bitmaps
and runtime DOM objects. Unreferenced sources are omitted from save files.

`Smart_layer_action` applies atomic structure/ownership changes without JSON-cloning
canvas objects. `Smart_source_action` swaps immutable revisions and invalidates all
instances. Undo history retains the revisions needed to restore earlier contents.

Contents tabs copy native document data and have independent histories. Saving
checks the parent's source revision; a stale tab cannot overwrite a replacement or
an undo performed in its parent. One contents tab is opened per parent/source pair.
Nesting is supported up to 16 levels on import. Source graphs are validated before
restoring them. A parent cannot close while its contents tabs remain open.

The parent is checkpointed before entering Edit Contents. Child autosaves cannot
replace the parent recovery snapshot. Uncommitted child edits are not crash-recovered;
use Save Contents to commit them to the parent, then save the parent project.

## Initial scope and limitations

- Images preserve intrinsic dimensions. Text, shapes and self-contained groups use
  a document-sized source frame and preserve their editable internal records.
- Multiple selected layers should be grouped first. Group conversion currently
  rejects adjustment layers, Studio vector records, clipping dependencies, non-Normal
  child blend modes and locked descendants. Move contents inside document bounds
  before conversion. This avoids silently changing backdrop-dependent compositing.
- Source composites are rasterized at source-document resolution. Enlarging raster
  content cannot create detail; vector/text supersampling at arbitrary instance scales
  is not implemented. Edit the source dimensions when a larger render is needed.
- Perspective/mesh warp, an expanded Smart Filter engine, Photoshop Smart Object
  interchange, worker rendering and tiled large-document rendering are future work.
- Unfiltered Smart Layers use WebGL when available; Smart Layers with live effects
  use the Canvas compositor to preserve effect scaling. Instances share decoded source data; no per-instance copy is generated until
  rasterization. History memory estimates include source bitmaps and encoded previews.
  Native JSON still uses data URLs and can become large for high-resolution projects.

## Validation

- `node --test tests/smart-sources.test.cjs`: source serialization, missing references,
  invalid inputs, nesting and cycles (no added dependencies).
- `tests/smart-layers-browser.html`: serve the monorepo `apps/` folder, open
  `/studio/tests/smart-layers-browser.html`; runs against `dist/` in a real browser.
  Checks source preservation, conversion undo, duplicate sharing, pixel protection,
  live filter undo, isolated contents/history, shared updates, independent copies,
  replacement, masks, Canvas/WebGL rendering, native roundtrip, nesting, groups and text.
- Existing `tests/mask-selection.test.cjs` remains the mask regression suite.
- `npm run build` builds the production editor.
