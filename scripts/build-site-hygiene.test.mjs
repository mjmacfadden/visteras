import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const source = readFileSync(new URL('./build-site.sh', import.meta.url), 'utf8');
const copyFunction = source.slice(source.indexOf('copy_tree() {'), source.indexOf('\nfor app in'));

for (const fallback of [false, true]) {
  test(`site copy excludes private/local/test files (${fallback ? 'tar fallback' : 'default copier'})`, () => {
    const root = mkdtempSync(join(tmpdir(), 'visteras-hygiene-'));
    try {
      const src = join(root, 'src');
      const dest = join(root, 'dest');
      const blocked = ['.env', '.env.local', '.env.example', 'nested/.env.production',
        'private.pem', 'private.key', 'credentials.json', 'demo-service-account.json',
        'config.keys.local.js', '.vscode/settings.json', '.firebase/cache',
        'tests/test.js', 'node_modules/module.js', 'debug.log', 'draft.bak'];
      const allowed = ['index.html', 'js/app.js', 'images/icon.svg', 'dist/app.js'];
      for (const file of [...blocked, ...allowed]) {
        const path = join(src, file);
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, 'fixture');
      }
      const forceTar = fallback ? 'command() { if [[ "$1" == "-v" && "$2" == "rsync" ]]; then return 1; fi; builtin command "$@"; }\n' : '';
      execFileSync('bash', ['-c', `set -euo pipefail\n${forceTar}${copyFunction}\ncopy_tree "$1" "$2"`, 'hygiene', src, dest]);
      for (const file of blocked) assert.equal(existsSync(join(dest, file)), false, file);
      for (const file of allowed) assert.equal(existsSync(join(dest, file)), true, file);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
