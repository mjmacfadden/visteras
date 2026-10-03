#!/usr/bin/env node
/**
 * Copy shared tool icons (packages/icons/tools/*.svg, currentColor) into the apps
 * (copy-at-build, same pattern as packages/tool-free.js and packages/ui).
 *
 *   node packages/icons/scripts/copy-tools.mjs          write apps/<app>/images/tools/*.svg
 *   node packages/icons/scripts/copy-tools.mjs --check  exit 1 if a copy is stale/missing
 *
 * Copies are committed so the per-app dev servers serve them as-is;
 * scripts/build-site.sh re-runs this before assembling site/.
 * Edit packages/icons/tools, never the copies.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = path.join(repoRoot, 'packages/icons/tools');
export const TARGETS = ['apps/vector/images/tools', 'apps/studio/images/tools'];

const icons = () => fs.readdirSync(SRC).filter((f) => f.endsWith('.svg')).sort();

export function staleCopies() {
  const stale = [];
  const names = new Set(icons());
  for (const t of TARGETS) {
    const dir = path.join(repoRoot, t);
    for (const f of names) {
      const dest = path.join(dir, f);
      if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== fs.readFileSync(path.join(SRC, f), 'utf8')) stale.push(`${t}/${f}`);
    }
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (!names.has(f)) stale.push(`${t}/${f}`);
  }
  return stale;
}

function main() {
  if (process.argv.includes('--check')) {
    const stale = staleCopies();
    if (stale.length) {
      console.error('Tool icon copies are stale — run: npm run build:icons\n  ' + stale.join('\n  '));
      process.exit(1);
    }
    console.log('Tool icon copies are up to date');
    return;
  }
  const names = new Set(icons());
  for (const t of TARGETS) {
    const dir = path.join(repoRoot, t);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) if (!names.has(f)) fs.rmSync(path.join(dir, f));
    for (const f of names) fs.copyFileSync(path.join(SRC, f), path.join(dir, f));
  }
  console.log(`Copied ${names.size} tool icons to ${TARGETS.join(', ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
