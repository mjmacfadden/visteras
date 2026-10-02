#!/usr/bin/env node
/**
 * Copy @visteras/ui into the static apps (copy-at-build, like packages/tool-free.js
 * and packages/fonts → apps/<app>/lib/visteras-fonts.js).
 *
 *   node packages/ui/scripts/build-static.mjs          write apps/<app>/lib/visteras-ui/*
 *   node packages/ui/scripts/build-static.mjs --check  exit 1 if any copy is stale/missing
 *
 * The copies are committed so the per-app dev servers (npx serve apps/<app>,
 * Live Server, python -m http.server on apps/) work without a build step;
 * scripts/build-site.sh re-runs this before assembling site/. Studio does not
 * get a copy: webpack resolves '@visteras/ui' straight to packages/ui/src.
 * Never edit the copies by hand — edit packages/ui/src and re-run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(pkgRoot, '../..');
const SRC = path.join(pkgRoot, 'src');
export const STATIC_APPS = ['vector', 'inspire', 'collage'];

function banner(file) {
  const note = `@visteras/ui — generated from packages/ui/src/${file} by packages/ui/scripts/build-static.mjs — do not edit by hand`;
  return `/* ${note} */\n`;
}

export function expectedOutputs() {
  const files = fs.readdirSync(SRC).filter((f) => /\.(js|css)$/.test(f)).sort();
  const out = [];
  for (const app of STATIC_APPS) {
    for (const f of files) {
      out.push({
        file: path.join(repoRoot, 'apps', app, 'lib', 'visteras-ui', f),
        content: banner(f) + fs.readFileSync(path.join(SRC, f), 'utf8'),
      });
    }
  }
  return out;
}

export function staleOutputs() {
  const stale = expectedOutputs()
    .filter(({ file, content }) => !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content)
    .map(({ file }) => path.relative(repoRoot, file));
  // Copies whose source file was deleted.
  const srcFiles = new Set(fs.readdirSync(SRC));
  for (const app of STATIC_APPS) {
    const dir = path.join(repoRoot, 'apps', app, 'lib', 'visteras-ui');
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (!srcFiles.has(f)) stale.push(path.relative(repoRoot, path.join(dir, f)));
  }
  return stale;
}

function main() {
  if (process.argv.includes('--check')) {
    const stale = staleOutputs();
    if (stale.length) {
      console.error('@visteras/ui copies are stale — run: npm run build:ui\n  ' + stale.join('\n  '));
      process.exit(1);
    }
    console.log('@visteras/ui copies are up to date');
    return;
  }
  const srcFiles = new Set(fs.readdirSync(SRC));
  for (const app of STATIC_APPS) {
    const dir = path.join(repoRoot, 'apps', app, 'lib', 'visteras-ui');
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (!srcFiles.has(f)) fs.rmSync(path.join(dir, f));
  }
  for (const { file, content } of expectedOutputs()) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  console.log(`Wrote @visteras/ui to ${STATIC_APPS.map((a) => `apps/${a}/lib/visteras-ui/`).join(', ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
