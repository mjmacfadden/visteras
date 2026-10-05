#!/usr/bin/env node
/**
 * Root test gate: runs every suite (even after a failure) and exits non-zero if any failed.
 * Suites reuse the per-app npm scripts so each can still be run on its own.
 *   npm test                 -> all suites
 *   npm test -- vector studio -> just those suites
 */
import { spawnSync } from 'node:child_process';

const SUITES = [
  ['hygiene', 'test:hygiene'],
  ['ui', 'test:ui'],
  ['vector', 'test:vector'],
  ['inspire', 'test:inspire'],
  ['studio', 'test:studio'],
  ['storage-check', 'check:storage']
];

const only = process.argv.slice(2);
const selected = only.length ? SUITES.filter(([name]) => only.includes(name)) : SUITES;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const results = [];

for (const [name, script] of selected) {
  console.log(`\n=== ${name} (npm run ${script}) ===`);
  const started = Date.now();
  const r = spawnSync(npm, ['run', '-s', script], { stdio: 'inherit', env: process.env });
  results.push({ name, ok: r.status === 0, secs: ((Date.now() - started) / 1000).toFixed(1) });
}

console.log('\n=== Test gate summary ===');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.secs}s)`);
const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error(`\n${failed.length} suite(s) failed: ${failed.map((r) => r.name).join(', ')}`);
  process.exit(1);
}
