const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas } = require('@napi-rs/canvas');

const documentStub = {createElement: () => createCanvas(1, 1)};
const resamplerSource = fs.readFileSync(path.join(__dirname, '../src/js/libs/raster-resample.js'), 'utf8').replace(/export /g, '');
const { resampleRaster, resamplePixels } = new Function('document', resamplerSource + '\nreturn {resampleRaster, resamplePixels};')(documentStub);

function method(file, name, next) {
 const source = fs.readFileSync(path.join(__dirname, '../src/js', file), 'utf8');
 const start = source.indexOf('\n\t' + name + '(');
 const end = source.indexOf(next, start);
 assert.ok(start >= 0 && end > start);
 return new Function('document', 'resampleRaster', 'return ({' + source.slice(start, end) + '})')(documentStub, resampleRaster)[name];
}
const draw = method('core/base-layers.js', '_draw_layer_content', '\n\t/**');
const sampling = method('core/renderer/webgl-renderer.js', '_configure_layer_sampling', '\n\t/**');

test('raster downscaling averages fine detail even when the destination disables smoothing', () => {
 const source = createCanvas(64, 64);
 const input = source.getContext('2d');
 input.fillStyle = 'white'; input.fillRect(0, 0, 64, 64);
 input.fillStyle = 'black';
 for (let x = 0; x < 64; x += 2) input.fillRect(x, 0, 1, 64);
 const output = createCanvas(13, 13).getContext('2d');
 output.imageSmoothingEnabled = false;
 draw.call({}, output, {type: 'image', link: source, width: 13, height: 13});
 const pixels = output.getImageData(0, 0, 13, 13).data;
 for (let i = 0; i < pixels.length; i += 4) {
  assert.ok(pixels[i] > 60 && pixels[i] < 195, `aliased sample: ${pixels[i]}`);
  assert.equal(pixels[i + 3], 255);
 }
 assert.equal(output.imageSmoothingEnabled, false, 'caller state must be restored');
});

test('native-size raster content preserves exact pixels and transparency', () => {
 const source = createCanvas(2, 1), input = source.getContext('2d');
 input.fillStyle = '#ff0000'; input.fillRect(0, 0, 1, 1);
 const output = createCanvas(2, 1).getContext('2d');
 draw.call({}, output, {type: 'image', link: source, width: 2, height: 1});
 assert.deepEqual([...output.getImageData(0, 0, 2, 1).data], [255, 0, 0, 255, 0, 0, 0, 0]);
});

for (const [version, width, height, expected] of [[2, 63, 37, true], [1, 64, 32, true], [1, 63, 37, false]]) {
 test(`GPU sampling: WebGL${version}, ${width}x${height}`, () => {
  const params = new Map(); let generated = 0;
  const gl = {TEXTURE_2D: 1, TEXTURE_MAG_FILTER: 2, TEXTURE_MIN_FILTER: 3, LINEAR: 4, LINEAR_MIPMAP_LINEAR: 5,
   texParameteri: (_, name, value) => params.set(name, value), generateMipmap: () => generated++};
  if (version === 2) gl.texStorage2D = () => {};
  sampling.call({gl}, width, height);
  assert.equal(params.get(gl.TEXTURE_MAG_FILTER), gl.LINEAR);
  assert.equal(params.get(gl.TEXTURE_MIN_FILTER), expected ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  assert.equal(generated, Number(expected));
 });
}


test('Lanczos preserves flat colors through non-integer resizing', () => {
 const pixels = new Uint8ClampedArray(17 * 11 * 4);
 for (let i = 0; i < pixels.length; i += 4) pixels.set([37, 81, 123, 128], i);
 const output = resamplePixels(pixels, 17, 11, 7, 5);
 for (let i = 0; i < output.length; i += 4) assert.deepEqual([...output.slice(i, i + 4)], [37, 81, 123, 128]);
});

test('transparent colors do not leak into resized edges', () => {
 const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 0]);
 const result = resamplePixels(pixels, 2, 1, 9, 1);
 for (let i = 0; i < result.length; i += 4) {
  if (result[i + 3] > 0) {
   assert.equal(result[i], 255);
   assert.equal(result[i + 2], 0);
  }
 }
});

test('canvas edits cannot return a stale resized image', () => {
 const input = createCanvas(16, 16), ctx = input.getContext('2d');
 ctx.fillStyle = 'red'; ctx.fillRect(0, 0, 16, 16);
 const first = resampleRaster(input, 7, 7);
 ctx.fillStyle = 'blue'; ctx.fillRect(0, 0, 16, 16);
 const second = resampleRaster(input, 7, 7);
 assert.notEqual(first, second);
 assert.deepEqual([...second.getContext('2d').getImageData(3, 3, 1, 1).data], [0, 0, 255, 255]);
});

test('resampled layer is copied without a second blur at final resolution', () => {
 const input = createCanvas(37, 19), ctx = input.getContext('2d');
 ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 37, 19);
 ctx.fillStyle = 'black'; ctx.fillRect(9, 0, 9, 19);
 const expected = resampleRaster(input, 13, 7).getContext('2d').getImageData(0, 0, 13, 7).data;
 const output = createCanvas(13, 7).getContext('2d');
 draw.call({}, output, {type: 'image', link: input, width: 13, height: 7});
 assert.deepEqual(output.getImageData(0, 0, 13, 7).data, expected);
});


test('GPU raster source uses the same final-resolution pixels as export', () => {
 const getSource = method('core/renderer/webgl-renderer.js', '_get_layer_source', '\n\t// ---- Mask');
 const input = createCanvas(37, 19), ctx = input.getContext('2d');
 ctx.fillStyle = '#abcdef'; ctx.fillRect(0, 0, 37, 19);
 ctx.fillStyle = '#172139'; ctx.fillRect(10, 0, 8, 19);
 const gpuSource = getSource.call({}, {type: 'image', link: input, width: 13, height: 7});
 const output = createCanvas(13, 7).getContext('2d');
 draw.call({}, output, {type: 'image', link: input, width: 13, height: 7});
 assert.deepEqual(output.getImageData(0, 0, 13, 7).data, gpuSource.getContext('2d').getImageData(0, 0, 13, 7).data);
});

test('immutable image cache reuses results and invalidates after source changes', async () => {
 const { Image } = require('@napi-rs/canvas');
 const canvas = createCanvas(8, 8), ctx = canvas.getContext('2d');
 ctx.fillStyle = 'red'; ctx.fillRect(0, 0, 8, 8);
 const image = new Image();
 const load = (src) => new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = src; });
 await load(canvas.toDataURL());
 const first = resampleRaster(image, 5, 5);
 assert.equal(resampleRaster(image, 5, 5), first);
 ctx.fillStyle = 'blue'; ctx.fillRect(0, 0, 8, 8);
 await load(canvas.toDataURL());
 const second = resampleRaster(image, 5, 5);
 assert.notEqual(second, first);
 assert.deepEqual([...second.getContext('2d').getImageData(2, 2, 1, 1).data], [0, 0, 255, 255]);
});
