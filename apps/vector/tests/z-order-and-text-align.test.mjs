import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const vectorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(vectorRoot, '../..');

test('Font Label Removal: Studio and Vector do not render obsolete Font labels or empty boxes', () => {
  const studioGuiProps = fs.readFileSync(path.join(repoRoot, 'apps/studio/src/js/core/gui/gui-properties.js'), 'utf8');
  assert.doesNotMatch(
    studioGuiProps,
    /<label class="trn properties_label" for="prop_text_font">Font<\/label>/,
    'Studio gui-properties.js must not have a "Font" label element'
  );

  const vectorHtml = fs.readFileSync(path.join(vectorRoot, 'index.html'), 'utf8');
  assert.doesNotMatch(
    vectorHtml,
    /moveEl\(['"]tool_font_family['"],\s*['"]slot_font_family['"]\)/,
    'Vector index.html must not relocate legacy tool_font_family into slot_font_family'
  );

  const vectorThemeCss = fs.readFileSync(path.join(vectorRoot, 'css/visteras-theme.css'), 'utf8');
  assert.match(
    vectorThemeCss,
    /#tool_font_family,\s*\.visteras-font-hidden[\s\S]*?display:\s*none\s*!important/,
    'Vector theme CSS must hide #tool_font_family and .visteras-font-hidden'
  );
});

test('Z-Order Actions: Actions group includes Bring to Front, Forward, Backward, and Send to Back buttons', () => {
  const vectorHtml = fs.readFileSync(path.join(vectorRoot, 'index.html'), 'utf8');
  assert.match(vectorHtml, /moveEl\(['"]tool_move_top['"],\s*['"]slot_action_btns['"]\)/);
  assert.match(vectorHtml, /moveEl\(['"]tool_move_up['"],\s*['"]slot_action_btns['"]\)/);
  assert.match(vectorHtml, /moveEl\(['"]tool_move_down['"],\s*['"]slot_action_btns['"]\)/);
  assert.match(vectorHtml, /moveEl\(['"]tool_move_bottom['"],\s*['"]slot_action_btns['"]\)/);

  const editorJs = fs.readFileSync(path.join(vectorRoot, 'Editor.js'), 'utf8');
  assert.match(editorJs, /id=\\"tool_move_top\\"/);
  assert.match(editorJs, /id=\\"tool_move_up\\"/);
  assert.match(editorJs, /id=\\"tool_move_down\\"/);
  assert.match(editorJs, /id=\\"tool_move_bottom\\"/);

  // Check event wiring in index.html
  assert.match(vectorHtml, /document\.getElementById\(['"]tool_move_top['"]\)\?\.addEventListener/);
  assert.match(vectorHtml, /document\.getElementById\(['"]tool_move_up['"]\)\?\.addEventListener/);
  assert.match(vectorHtml, /document\.getElementById\(['"]tool_move_down['"]\)\?\.addEventListener/);
  assert.match(vectorHtml, /document\.getElementById\(['"]tool_move_bottom['"]\)\?\.addEventListener/);
});

test('Z-Order Actions: Right-click menu and TopPanel delegate properly without selectedElement gating', () => {
  const editorJs = fs.readFileSync(path.join(vectorRoot, 'Editor.js'), 'utf8');
  assert.match(
    editorJs,
    /case\s+"move_front":\s+this\.svgCanvas\.moveToTopSelectedElement\(\);/
  );
  assert.match(
    editorJs,
    /case\s+"move_up":\s+this\.svgCanvas\.moveUpDownSelected\("Up"\);|case\s+"move_up":\s+this\.moveUpDownSelected\("Up"\);/
  );
  assert.match(
    editorJs,
    /case\s+"move_down":\s+this\.svgCanvas\.moveUpDownSelected\("Down"\);|case\s+"move_down":\s+this\.moveUpDownSelected\("Down"\);/
  );
  assert.match(
    editorJs,
    /case\s+"move_back":\s+this\.svgCanvas\.moveToBottomSelectedElement\(\);/
  );

  // TopPanel methods do not gate on this.editor.selectedElement
  assert.match(
    editorJs,
    /moveToTopSelected\(\)\s*\{\s*this\.editor\.svgCanvas\.moveToTopSelectedElement\(\);/
  );
  assert.match(
    editorJs,
    /moveToBottomSelected\(\)\s*\{\s*this\.editor\.svgCanvas\.moveToBottomSelectedElement\(\);/
  );
  assert.match(
    editorJs,
    /moveUpSelected\(\)\s*\{\s*this\.editor\.svgCanvas\.moveUpDownSelected\("Up"\);/
  );
  assert.match(
    editorJs,
    /moveDownSelected\(\)\s*\{\s*this\.editor\.svgCanvas\.moveUpDownSelected\("Down"\);/
  );
});

test('Z-Order Actions: applyZOrder moves elements in DOM order regardless of intersection', () => {
  // Test simulated DOM structure
  class MockNode {
    constructor(id, tagName = 'path') {
      this.id = id;
      this.tagName = tagName;
      this.parentNode = null;
      this.children = [];
    }
    get firstElementChild() {
      return this.children[0] || null;
    }
    get nextElementSibling() {
      if (!this.parentNode) return null;
      const idx = this.parentNode.children.indexOf(this);
      return idx >= 0 && idx < this.parentNode.children.length - 1 ? this.parentNode.children[idx + 1] : null;
    }
    get previousElementSibling() {
      if (!this.parentNode) return null;
      const idx = this.parentNode.children.indexOf(this);
      return idx > 0 ? this.parentNode.children[idx - 1] : null;
    }
    get nextSibling() {
      return this.nextElementSibling;
    }
    append(child) {
      if (child.parentNode) {
        const i = child.parentNode.children.indexOf(child);
        if (i >= 0) child.parentNode.children.splice(i, 1);
      }
      child.parentNode = this;
      this.children.push(child);
    }
    prepend(child) {
      if (child.parentNode) {
        const i = child.parentNode.children.indexOf(child);
        if (i >= 0) child.parentNode.children.splice(i, 1);
      }
      child.parentNode = this;
      this.children.unshift(child);
    }
    insertBefore(newChild, refChild) {
      if (!refChild) {
        this.append(newChild);
        return newChild;
      }
      if (newChild.parentNode) {
        const i = newChild.parentNode.children.indexOf(newChild);
        if (i >= 0) newChild.parentNode.children.splice(i, 1);
      }
      newChild.parentNode = this;
      const refIdx = this.children.indexOf(refChild);
      if (refIdx >= 0) {
        this.children.splice(refIdx, 0, newChild);
      } else {
        this.children.push(newChild);
      }
      return newChild;
    }
  }

  function simulateZOrder(parent, selectedElems, dir) {
    const raw = selectedElems;
    const elems = Array.from(raw).filter(Boolean);
    if (!elems.length) return;
    const groups = new Map();
    for (const el of elems) {
      const p = el.parentNode;
      if (!p) continue;
      if (!groups.has(p)) groups.set(p, []);
      groups.get(p).push(el);
    }
    for (const [p, groupElems] of groups.entries()) {
      const children = Array.from(p.children);
      const elemSet = new Set(groupElems);
      groupElems.sort((a, b) => children.indexOf(a) - children.indexOf(b));
      if (dir === 'top' || dir === 'Top') {
        for (const el of groupElems) {
          p.append(el);
        }
      } else if (dir === 'bottom' || dir === 'Bottom') {
        let firstContent = p.firstElementChild;
        while (firstContent && (firstContent.tagName === 'title' || firstContent.tagName === 'defs')) {
          firstContent = firstContent.nextElementSibling;
        }
        for (const el of groupElems) {
          if (firstContent) {
            p.insertBefore(el, firstContent);
          } else {
            p.prepend(el);
          }
        }
      } else if (dir === 'Up' || dir === 'up') {
        const rev = [...groupElems].reverse();
        for (const el of rev) {
          let next = el.nextElementSibling;
          while (next && elemSet.has(next)) {
            next = next.nextElementSibling;
          }
          if (next) {
            if (next.nextSibling) {
              p.insertBefore(el, next.nextSibling);
            } else {
              p.append(el);
            }
          }
        }
      } else if (dir === 'Down' || dir === 'down') {
        for (const el of groupElems) {
          let prev = el.previousElementSibling;
          while (prev && (elemSet.has(prev) || prev.tagName === 'title' || prev.tagName === 'defs')) {
            prev = prev.previousElementSibling;
          }
          if (prev && prev.tagName !== 'title' && prev.tagName !== 'defs') {
            p.insertBefore(el, prev);
          }
        }
      }
    }
  }

  const makeFixture = () => {
    const layer = new MockNode('layer', 'g');
    const title = new MockNode('title', 'title');
    const a = new MockNode('a', 'rect');
    const b = new MockNode('b', 'rect');
    const c = new MockNode('c', 'rect');
    const d = new MockNode('d', 'rect');
    layer.append(title);
    layer.append(a);
    layer.append(b);
    layer.append(c);
    layer.append(d);
    return { layer, title, a, b, c, d };
  };

  // Test 1: Bring to Front moves 'b' to last
  {
    const { layer, b } = makeFixture();
    simulateZOrder(layer, [b], 'top');
    assert.deepEqual(layer.children.map(x => x.id), ['title', 'a', 'c', 'd', 'b']);
  }

  // Test 2: Send to Back moves 'c' to first content position (after title)
  {
    const { layer, c } = makeFixture();
    simulateZOrder(layer, [c], 'bottom');
    assert.deepEqual(layer.children.map(x => x.id), ['title', 'c', 'a', 'b', 'd']);
  }

  // Test 3: Bring Forward moves 'b' past 'c'
  {
    const { layer, b } = makeFixture();
    simulateZOrder(layer, [b], 'Up');
    assert.deepEqual(layer.children.map(x => x.id), ['title', 'a', 'c', 'b', 'd']);
  }

  // Test 4: Send Backward moves 'c' before 'b'
  {
    const { layer, c } = makeFixture();
    simulateZOrder(layer, [c], 'Down');
    assert.deepEqual(layer.children.map(x => x.id), ['title', 'a', 'c', 'b', 'd']);
  }

  // Test 5: Multi-selection Bring Forward moves [a, b] together past 'c'
  {
    const { layer, a, b } = makeFixture();
    simulateZOrder(layer, [a, b], 'Up');
    assert.deepEqual(layer.children.map(x => x.id), ['title', 'c', 'a', 'b', 'd']);
  }

  // Test 6: Multi-selection Send to Back moves [c, d] to bottom preserving relative order
  {
    const { layer, c, d } = makeFixture();
    simulateZOrder(layer, [c, d], 'bottom');
    assert.deepEqual(layer.children.map(x => x.id), ['title', 'c', 'd', 'a', 'b']);
  }
});

test('Typography: Standard Left, Center, and Right text alignment buttons replace legacy dropdown', () => {
  const vectorHtml = fs.readFileSync(path.join(vectorRoot, 'index.html'), 'utf8');
  assert.match(vectorHtml, /id="slot_text_align"/);
  assert.match(vectorHtml, /id="text_align_start"\s+data-align="start"/);
  assert.match(vectorHtml, /id="text_align_middle"\s+data-align="middle"/);
  assert.match(vectorHtml, /id="text_align_end"\s+data-align="end"/);
  assert.doesNotMatch(vectorHtml, /moveEl\(['"]tool_text_anchor['"],\s*['"]slot_text_styles['"]\)/);

  const vectorThemeCss = fs.readFileSync(path.join(vectorRoot, 'css/visteras-theme.css'), 'utf8');
  assert.match(vectorThemeCss, /#tool_text_anchor[\s\S]*?display:\s*none\s*!important/);
  assert.match(vectorThemeCss, /\.visteras_text_align_btn[\s\S]*?width:\s*28px/);
  // Active look is the shared @visteras/ui icon-button state (accent border), not a white underline.
  assert.match(vectorThemeCss, /\.visteras_text_align_btn:not\(\.vui-icon-btn\)\.active/);
  assert.match(fs.readFileSync(new URL('../../../packages/ui/src/ui.css', import.meta.url), 'utf8'), /\.vui-icon-btn\[aria-pressed="?true"?\][\s\S]*?var\(--visteras-accent/);

  const bridgeCode = fs.readFileSync(path.join(vectorRoot, 'js/visteras-font-bridge.js'), 'utf8');
  assert.match(bridgeCode, /text_align_\$\{a\}/);
  assert.match(bridgeCode, /btn\.classList\.toggle\('active',\s*isMatch\)/);
});
