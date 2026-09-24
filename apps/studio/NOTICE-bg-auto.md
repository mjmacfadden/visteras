# Background removal credits (Studio)

Studio’s **Remove Background** and **Select Subject** features run the
[`onnx-community/ISNet-ONNX`](https://huggingface.co/onnx-community/ISNet-ONNX)
model in the browser via [`@huggingface/transformers`](https://github.com/huggingface/transformers.js).

## License notes

- The `onnx-community/ISNet-ONNX` model card / packaging attributes the weights
  as **Apache-2.0** via the rembg lineage.
- The **upstream DIS (Highly Accurate Dichotomous Image Segmentation) LICENSE**
  was **not independently confirmed** for this integration. Treat commercial
  redistribution of the weights with care until that upstream license is verified.
- Do **not** ship BRIA RMBG (non-commercial) or `@imgly/background-removal` (AGPL)
  in this tree.

## Model location

Weights are **not** stored in this repository or the GitHub Pages publish tree.
They download on first use from the location in:

`apps/studio/src/js/config.js` → `config.BG_AUTO_MODEL_LOCATION`

Default: `onnx-community/ISNet-ONNX` (Hugging Face CDN). Override with a full
base URL to use a self-hosted mirror (e.g. Cloudflare R2).

## Runtime library CDN

`@huggingface/transformers` is loaded at runtime from jsDelivr **`/+esm`** inside the Web Worker (version pinned in `config.BG_AUTO_TRANSFORMERS_CDN` to match the npm dependency). The `/+esm` build rewrites bare imports such as `onnxruntime-web/webgpu` to absolute CDN URLs (required in module workers; import maps do not apply). ONNX Runtime WASM/JSEP binaries come from the pinned `config.BG_AUTO_ORT_WASM_CDN`. The Studio service worker runtime-caches these CDN URLs after first use for offline; model weights still use the Transformers.js cache via `config.BG_AUTO_MODEL_LOCATION`.
