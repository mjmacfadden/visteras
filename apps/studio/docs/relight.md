# Relight

Image ▸ Relight… edits the selected, unlocked raster image layer. It uses the same fullscreen modal shell, header buttons, viewer and sidebar classes as Raw Develop. A preview never changes document pixels; Apply is one ordinary image-history action, so Undo restores the source. Existing layer position, opacity, mask and filters remain intact. Select the image thumbnail rather than a mask. Smart Layers must be rasterized first.

## Controls

- Drag the numbered light handle on the image to move its source. Arrow keys nudge a focused handle (Shift makes a larger step).
- Add up to eight lights, switch between Bulb and Sun, change their color, intensity, diffusion and distance, disable or remove them.
- Bulb lights attenuate over distance. Sun lights have a constant direction over the surface and independent Softness and Diffusion.
- Sun patterns: Blinds, Window, Light Strip, Foliage, Palm, Branches, Checkerboard, Polka Dots, horizontal/diagonal lines, Grid, Weave, Noise and Crosshatch. These are independently generated procedural masks, warped by estimated depth. Pattern coordinates account for image aspect ratio when rotating.
- Move, scale and rotate a pattern using the on-image square handles or the sidebar fields. Invert swaps its light/dark areas. Load Pattern reads a local image as a grayscale/alpha mask; Define from Layer uses the captured raster source. Custom masks live only in dialog memory.
- The color dropdown shows swatches for nine temperature presets (1000–10000K), a checkmark for the selected entry, and a custom color picker. Arrow keys navigate the menu; Escape closes it without canceling the dialog. Custom color is retained when switching to presets and back. These are approximate photographic gel colors, not a calibrated blackbody simulation.
- Fit, 1:1, zoom buttons and a percentage field control the preview. Space-drag or middle-drag pans; Ctrl/Cmd/Alt-wheel zooms around the cursor. Hold to compare and Show original reveal source pixels. Hide light guides removes all handles without changing the rendered lighting. Reset Light resets only the selected source.
- Original lighting controls how much existing illumination remains. Show original compares with untouched pixels. Reset restores the initial configuration: original lighting 75%, closer distance 0.3, intensity 0.8 and diffusion 0.3, making source movement easier to see.
- Apply computes the full-resolution result. Cancel terminates the workers without changing pixels. A failed download offers Retry; GPU initialization failure retries in a fresh CPU worker.

## Independent implementation and sources

Observed ImageFlow's public Relight UI at https://imageflow.dev on October 13, 2026: Image menu command, initial model download, multiple draggable lights, Bulb/Sun types, color, intensity, diffusion, distance, original-lighting control, reduced-resolution preview and full-resolution Apply. A second audit confirmed Sun-specific Softness, projected pattern choices, move/scale/rotate/invert controls, imported/defined patterns, temperature presets, per-light reset, guide visibility and zoom/pan. This observation does **not** establish which model or rendering algorithm ImageFlow uses. No ImageFlow JavaScript, shaders, model weights, icons or CSS were inspected, extracted or copied.

Our code independently estimates relative depth using `onnx-community/depth-anything-v2-small`, normalizes it, derives surface normals using finite differences, and applies Lambert-style diffuse lighting with distance attenuation in linear RGB. It uses an established public model and Studio's already-pinned Transformers.js / ONNX runtime URLs. Geometry and rendering are original pure functions tested independently of the UI.

Primary references:
- Depth Anything V2 Small ONNX model, Apache-2.0: https://huggingface.co/onnx-community/depth-anything-v2-small
- Original model: https://huggingface.co/depth-anything/Depth-Anything-V2-Small
- Transformers.js depth-estimation API: https://huggingface.co/docs/transformers.js/api/pipelines#depthestimationpipeline

Inference and rendering run in browser workers. Only public model/library files are downloaded; no image is submitted to a remote inference service. Browser model caching contains model assets, not document pixels. Nothing adds document autosave or persistent depth maps.

## Limits

This is depth-guided photographic shading, not generative reconstruction or an intrinsic-albedo decomposition. It cannot fully remove baked-in shadows, recover clipped details, cast new occlusion shadows, or infer accurate reflective/translucent material behavior. Depth estimation can make mistakes at hair, transparency and object boundaries. The inferred geometry is bounded in resolution; full-resolution Apply preserves source pixel dimensions and alpha, rather than inventing higher-resolution geometry. Original lighting darkens existing illumination uniformly; it does not recover true albedo.

The first run requires internet access to download model assets. Subsequent runs can reuse the browser's model cache. WebGPU is preferred with CPU fallback; performance depends on the device and source image dimensions. No silent fake depth fallback is used: an inference failure is shown and Apply stays disabled.

Relight operates on the whole raster layer, not a selection-only region. Its normal layer mask still controls the visible result. The lighting recipe is not stored as an editable Smart Filter; the applied pixels survive ordinary `.vsd` save/load.

## Validation

- `node --test apps/studio/tests/*.test.cjs`: 294 pass, one existing local-PSD-fixture skip (30 new Relight tests).
- `npm test`: all seven gates pass.
- `npm run check:storage`: zero violations; only the existing non-Vector document-store warnings.
- `npm run build:studio`: production compilation succeeds; two bundle-size warnings.
- Chrome: local depth inference, Raw Develop modal layout, visible light handles, live drag position, intensity edits, second Sun light, original comparison, full-resolution Apply and Undo verified using the bundled mountain image. Screenshot pixel comparison found 1,273,201 changed channel values in the sampled photo area after Apply and zero differences after Undo.
- Mounted-handler tests verify stable pointer capture and position updates until release. Action tests verify a single commit, document-change protection and cancellation while rendering. Pure tests cover all procedural masks, inversion, projection, custom masks, softness, color presets and cursor-centered zoom. Mounted pointer callbacks cover light and pattern move/scale/rotate gestures.
