// Direct, scale-aware Lanczos-3. Filter premultiplied RGBA to avoid color
// bleeding from transparent pixels; retain floating-point precision between passes.
const cache = new WeakMap();
const sinc = (x) => Math.abs(x) < 1e-8 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);

function weights(input, output) {
 const scale = Math.min(1, output / input);
 const radius = 3 / scale;
 return Array.from({ length: output }, (_, i) => {
  const center = (i + 0.5) * input / output - 0.5;
  const first = Math.max(0, Math.ceil(center - radius));
  const last = Math.min(input - 1, Math.floor(center + radius));
  const values = new Float64Array(last - first + 1);
  let total = 0;
  for (let j = first; j <= last; j++) {
   const distance = (j - center) * scale;
   const value = Math.abs(distance) >= 3 ? 0 : sinc(distance) * sinc(distance / 3);
   values[j - first] = value;
   total += value;
  }
  for (let j = 0; j < values.length; j++) values[j] /= total;
  return { first, values };
 });
}

export function resamplePixels(pixels, width, height, targetWidth, targetHeight) {
 const horizontal = weights(width, targetWidth);
 const vertical = weights(height, targetHeight);
 const intermediate = new Float32Array(targetWidth * height * 4);
 for (let y = 0; y < height; y++) {
  for (let x = 0; x < targetWidth; x++) {
   const { first, values } = horizontal[x];
   const out = (y * targetWidth + x) * 4;
   for (let k = 0; k < values.length; k++) {
    const pos = (y * width + first + k) * 4;
    const alpha = pixels[pos + 3] / 255;
    const weight = values[k];
    for (let c = 0; c < 3; c++) intermediate[out + c] += pixels[pos + c] * alpha * weight;
    intermediate[out + 3] += pixels[pos + 3] * weight;
   }
  }
 }
 const result = new Uint8ClampedArray(targetWidth * targetHeight * 4);
 for (let y = 0; y < targetHeight; y++) {
  const { first, values } = vertical[y];
  for (let x = 0; x < targetWidth; x++) {
   let r = 0, g = 0, b = 0, a = 0;
   for (let k = 0; k < values.length; k++) {
    const pos = ((first + k) * targetWidth + x) * 4;
    const weight = values[k];
    r += intermediate[pos] * weight;
    g += intermediate[pos + 1] * weight;
    b += intermediate[pos + 2] * weight;
    a += intermediate[pos + 3] * weight;
   }
   const out = (y * targetWidth + x) * 4;
   if (a > 1e-6) {
    result[out] = r * 255 / a;
    result[out + 1] = g * 255 / a;
    result[out + 2] = b * 255 / a;
    result[out + 3] = a;
   }
  }
 }
 return result;
}

export function resampleRaster(source, targetWidth, targetHeight) {
 if (typeof source.complete === 'boolean' && !source.complete) return source;
 const width = source.naturalWidth || source.width;
 const height = source.naturalHeight || source.height;
 targetWidth = Math.max(1, Math.round(targetWidth));
 targetHeight = Math.max(1, Math.round(targetHeight));
 if (!(width > 0 && height > 0 && Number.isFinite(targetWidth) && Number.isFinite(targetHeight))) return source;
 if (width === targetWidth && height === targetHeight) return source;
 // Bound synchronous scratch memory. Very large images retain browser filtering.
 if (Math.max(width * height, targetWidth * height, targetWidth * targetHeight) > 16000000) return source;
 // Images are immutable between loads; canvases may be painted without changing identity.
 const immutable = typeof source.src === 'string' && source.complete;
 const key = `${width}:${height}:${targetWidth}:${targetHeight}`;
 const previous = immutable && cache.get(source);
 if (previous && previous.key === key && previous.src === source.src) return previous.canvas;
 const input = document.createElement('canvas');
 input.width = width;
 input.height = height;
 const inputCtx = input.getContext('2d');
 inputCtx.imageSmoothingEnabled = false;
 inputCtx.drawImage(source, 0, 0);
 let pixels;
 try {
  pixels = inputCtx.getImageData(0, 0, width, height).data;
 } catch (error) {
  if (error.name === 'SecurityError') return source;
  throw error;
 }
 const output = document.createElement('canvas');
 output.width = targetWidth;
 output.height = targetHeight;
 const ctx = output.getContext('2d');
 const image = ctx.createImageData(targetWidth, targetHeight);
 image.data.set(resamplePixels(pixels, width, height, targetWidth, targetHeight));
 ctx.putImageData(image, 0, 0);
 if (immutable) cache.set(source, { key, src: source.src, canvas: output });
 return output;
}
