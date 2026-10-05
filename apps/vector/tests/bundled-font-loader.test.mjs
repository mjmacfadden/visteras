import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFontFamily, resetFontLoaderState } from '../../../packages/fonts/src/loader.js';

test('bundled Roboto loads requested faces without injecting Google CSS', async () => {
  const previous = globalThis.document;
  const requests = [];
  const faces = [{ family: '"Roboto"' }];
  faces.load = async request => { requests.push(request); return []; };
  globalThis.document = {
    fonts: faces,
    querySelector() { throw new Error('Bundled Roboto must not request Google CSS'); },
  };
  try {
    resetFontLoaderState();
    assert.equal(await loadFontFamily({ family: 'Roboto', source: 'google', variants: ['regular', '700italic'] }), true);
    assert.deepEqual(requests, ['normal 400 16px "Roboto"', 'italic 700 16px "Roboto"']);
  } finally {
    globalThis.document = previous;
    resetFontLoaderState();
  }
});
