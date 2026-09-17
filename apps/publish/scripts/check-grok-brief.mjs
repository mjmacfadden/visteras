/**
 * Quick self-check: parseGrokBrief on the canonical sample.
 * Run: node --experimental-strip-types scripts/check-grok-brief.mjs
 * (also invoked via: node scripts/check-grok-brief.mjs)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const sample = readFileSync(join(root, 'src/data/samples/grok-brief-example.md'), 'utf8');

async function loadParser() {
  const ts = join(root, 'src/lib/grokBrief.ts');
  try {
    return await import(pathToFileURL(ts).href);
  } catch {
    // Re-exec under strip-types
    const r = spawnSync(
      process.execPath,
      ['--experimental-strip-types', fileURLToPath(import.meta.url)],
      { cwd: root, encoding: 'utf8', env: { ...process.env, GROK_CHECK_STRIP: '1' } },
    );
    process.stdout.write(r.stdout || '');
    process.stderr.write(r.stderr || '');
    process.exit(r.status ?? 1);
  }
}

const { parseGrokBrief, grokItemsAsStories, extractImageMarker } = await loadParser();
const parsed = parseGrokBrief(sample);
const byKind = Object.fromEntries(parsed.sections.map((s) => [s.kind, s]));
const cards = grokItemsAsStories(parsed);

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('ok:', msg);
  }
}

assert(parsed.structured === true, 'structured === true');
const leadItem = parsed.sections[1]?.items[0];
assert(!!leadItem, 'has leadItem');
assert(!!leadItem?.imageUrl, 'leadItem has imageUrl');
assert(!/!\(/.test(leadItem?.body || ''), 'lead body strips image marker');

for (const k of ['local', 'sports', 'markets', 'national', 'glance']) {
  assert(!!byKind[k], `has ${k} section`);
}
assert(byKind.national.items.length >= 2, `national items >= 2 (got ${byKind.national.items.length})`);
assert(
  byKind.national.items.every((i) => !!i.source),
  'national items have sources',
);
assert(byKind.local.items.length >= 2, `local items >= 2 (got ${byKind.local.items.length})`);
assert(byKind.sports.items.length >= 2, `sports items >= 2 (got ${byKind.sports.items.length})`);
assert(byKind.markets.items.length >= 2, `markets items >= 2 (got ${byKind.markets.items.length})`);
assert(byKind.glance.bullets.length >= 3, `glance bullets >= 3 (got ${byKind.glance.bullets.length})`);
assert(
  !parsed.sections.some((s) =>
    s.items.some((i) => /^(At a glance|National News|Global News|Local News)/i.test(i.headline)),
  ),
  'section titles not misclassified as headlines',
);

assert(
  extractImageMarker('****https://example.com/a.jpg****') === 'https://example.com/a.jpg',
  'simple ****url**** marker',
);
assert(
  extractImageMarker(
    '****https://example.com/a.jpg (https://example.com/a.jpg//)****',
  ) === 'https://example.com/a.jpg',
  '****url (url//)**** marker',
);
assert(
  extractImageMarker(
    '!(https://commons.wikimedia.org/wiki/Special:FilePath/Chicago_Bears_(51156683545).jpg)',
  ) ===
    'https://commons.wikimedia.org/wiki/Special:FilePath/Chicago_Bears_(51156683545).jpg',
  'markdown !(...) marker with parentheses in URL',
);
assert(
  extractImageMarker(
    '![Chicago Bears](https://commons.wikimedia.org/wiki/Special:FilePath/Chicago_Bears_(51156683545).jpg)',
  ) ===
    'https://commons.wikimedia.org/wiki/Special:FilePath/Chicago_Bears_(51156683545).jpg',
  'standard ![alt](...) marker with parentheses in URL',
);
assert(extractImageMarker('***Not an image***') === null, '*** not treated as image');

// Legacy ## + ***hed*** dialect still parses
const legacy = parseGrokBrief(`## National & World

***Fed holds rates***
**Named source: Market Desk**
Body here.

## What to watch today
- one
- two
`);
assert(legacy.structured, 'legacy ## dialect structured');
// Rich text / HTML paste conversion tests
const htmlConverterTs = join(root, 'src/lib/htmlToMarkdown.ts');
const { htmlToMarkdown } = await import(pathToFileURL(htmlConverterTs).href);

const richSampleHtml = `
<h2>Lead Story</h2>
<img src="https://commons.wikimedia.org/wiki/Special:FilePath/Chicago_Bears_(51156683545).jpg" alt="Chicago Bears" />
<p><strong>Bears Secure Historic Victory</strong></p>
<p><em>Named source: Chicago Tribune, Sept 13, 2026</em></p>
<p>The Chicago Bears scored a thrilling fourth-quarter touchdown to seal the win.</p>
<h2>National News</h2>
<p><strong>Fed Announces Rate Decision</strong></p>
<p><em>Named source: Reuters, Sept 13, 2026</em></p>
<p>Federal Reserve policymakers kept the benchmark interest rate unchanged.</p>
<h2>What to watch today</h2>
<ul>
  <li>Senate hearing on AI regulation at 10 AM ET</li>
  <li>Consumer sentiment report released at 1 PM ET</li>
</ul>
`;

const convertedMd = htmlToMarkdown(richSampleHtml);
const parsedFromHtml = parseGrokBrief(convertedMd);

assert(parsedFromHtml.structured === true, 'rich text html converted and parsed as structured brief');
assert(parsedFromHtml.sections.length >= 2, 'converted html has multiple sections');
const htmlLeadItem = parsedFromHtml.sections.find((s) => s.kind === 'national')?.items[0];
assert(!!htmlLeadItem, 'converted html lead item found');
assert(
  htmlLeadItem?.imageUrl ===
    'https://commons.wikimedia.org/wiki/Special:FilePath/Chicago_Bears_(51156683545).jpg',
  'converted html image extracted into imageUrl',
);
assert(htmlLeadItem?.headline === 'Bears Secure Historic Victory', 'converted html headline extracted');
assert(
  htmlLeadItem?.source === 'Chicago Tribune, Sept 13, 2026',
  'converted html source extracted',
);

console.log('\n--- summary ---');
for (const s of parsed.sections) {
  console.log(
    `  ${s.kind.padEnd(10)} "${s.heading}" items=${s.items.length} paras=${s.paragraphs.length} bullets=${s.bullets.length}`,
  );
}
console.log(`cards: ${cards.length}`);
console.log(`footer: ${parsed.footer}`);

if (failed) {
  console.error(`\nSELF-CHECK FAILED (${failed})`);
  process.exit(1);
}
console.log('\nSELF-CHECK PASSED');
