/**
 * Convert mini-gen .ipuz files → Royko crossword.ts bank (≥366 unique 5×5 minis).
 *
 * Source: src/scripts/crossword-gen/ipuz-out/*.ipuz (American minis w/ black squares)
 * Clues:  src/scripts/data/clue-cache.json (+ built-in crosswordese)
 *
 * Does NOT regenerate fills — only converts, numbers, clues, and validates.
 * Jumble/trivia banks are untouched (see generate-puzzle-banks.mjs).
 *
 * Usage: node src/scripts/generate-mini-crosswords.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../..');
const ipuzDir = join(__dirname, 'crossword-gen/ipuz-out');
const clueCachePath = join(__dirname, 'data/clue-cache.json');
const outPath = join(__dirname, '../data/puzzles/crossword.ts');

const SIZE = 5;
const TARGET = 366; // full leap year
const TITLES = [
  'Morning Mini',
  'Coffee Grid',
  'Ink & Squares',
  'Metra Mini',
  'Front Page Fill',
  'Lake Effect',
  'Northbrook Five',
  'Broadsheet Bite',
  'Type Case',
  'Deadline Dash',
];

const HAND_CLUES = {
  ORALB: 'Toothbrush brand',
  SHAMU: 'SeaWorld orca, once',
  ACELA: 'Amtrak express train',
  KEANU: 'Reeves of "The Matrix"',
  ANITA: 'Baker or Hill',
  TREVI: "Rome's famous fountain",
  OMANI: 'Muscat native',
  OILER: 'Houston NHL player',
  ELITE: 'Cream of the crop',
  AROMA: 'Pleasant smell',
  ADIEU: 'Farewell, in France',
  CAIRO: "Egypt's capital",
  OPERA: 'La Bohème, e.g.',
  ATONE: 'Make amends',
  INSET: 'Map within a map',
  ELSE: 'Otherwise',
  END: 'Finish',
  EASE: 'Facility; comfort',
  NEST: "Bird's home",
  EWES: 'Female sheep',
  MUD: 'Wet dirt',
  PHONY: 'Fake',
  OUNCE: '1/16 of a pound',
  ORALS: 'Spoken exams',
  FLEE: 'Run away',
  HARDG: 'Sound in "go," not "gem"',
  DOUP: 'Fold over, as a hem (var.)',
  ZIG: 'Sharp turn',
  PHO: 'Vietnamese noodle soup',
  AAA: "Motorists' org.",
  PEPSI: 'Coke rival',
  REEL: 'Fishing spool',
  RILE: 'Annoy',
  ALONG: 'In accompaniment',
  TEMPO: 'Musical pace',
  TINA: 'Turner or Fey',
  PLATE: 'Dinner dish',
  MANOR: "Lord's estate",
  BALD: 'Hairless',
  POT: 'Cooking vessel',
};

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Leap-year MM-DD for dayOfYear 1..366 (2028 is a leap year). */
function mmddFromDoyLeap(doy) {
  const d = new Date(Date.UTC(2028, 0, doy));
  return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function loadClues() {
  const cache = existsSync(clueCachePath)
    ? JSON.parse(readFileSync(clueCachePath, 'utf8'))
    : {};
  return { ...cache, ...HAND_CLUES };
}

function clueFor(word, clues) {
  const u = word.toUpperCase();
  if (clues[u]) return clues[u];
  if (clues[word]) return clues[word];
  // mild crossword-style fallback — still human-readable
  if (u.length === 3) return 'Three-letter fill';
  if (u.length === 4) return 'Four-letter fill';
  return 'Five-letter fill';
}

function isLetter(sol, r, c) {
  if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return false;
  const ch = sol[r][c];
  return Boolean(ch && ch !== '#' && ch !== '.');
}

function readSlot(sol, row, col, dir) {
  let word = '';
  let r = row;
  let c = col;
  while (isLetter(sol, r, c)) {
    word += sol[r][c];
    if (dir === 'across') c += 1;
    else r += 1;
  }
  return word;
}

/** Standard American numbering: shared start → same number. */
function numberAndSlots(sol) {
  const slots = [];
  let num = 1;
  const startNum = new Map(); // "r,c" → number

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!isLetter(sol, r, c)) continue;
      const acrossStart = !isLetter(sol, r, c - 1);
      const downStart = !isLetter(sol, r - 1, c);
      const acrossWord = acrossStart ? readSlot(sol, r, c, 'across') : '';
      const downWord = downStart ? readSlot(sol, r, c, 'down') : '';
      const hasAcross = acrossWord.length >= 2;
      const hasDown = downWord.length >= 2;
      if (!hasAcross && !hasDown) continue;

      const n = num++;
      startNum.set(`${r},${c}`, n);
      if (hasAcross) {
        slots.push({ num: n, row: r, col: c, dir: 'across', answer: acrossWord });
      }
      if (hasDown) {
        slots.push({ num: n, row: r, col: c, dir: 'down', answer: downWord });
      }
    }
  }
  return { slots, startNum };
}

function solutionFlat(sol) {
  const out = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const ch = sol[r][c];
      out.push(ch === '#' ? '.' : String(ch).toLowerCase());
    }
  }
  return out;
}

function readSlotFlat(solution, size, row, col, dir) {
  let word = '';
  let r = row;
  let c = col;
  while (r >= 0 && c >= 0 && r < size && c < size) {
    const ch = solution[r * size + c];
    if (!ch || ch === '.') break;
    word += ch;
    if (dir === 'across') c += 1;
    else r += 1;
  }
  return word;
}

function extractSlotsFlat(solution, size) {
  const slots = [];
  const isL = (r, c) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return false;
    const ch = solution[r * size + c];
    return Boolean(ch && ch !== '.');
  };
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isL(r, c)) continue;
      if (!isL(r, c - 1)) {
        const answer = readSlotFlat(solution, size, r, c, 'across');
        if (answer.length >= 2) slots.push({ row: r, col: c, dir: 'across', answer });
      }
      if (!isL(r - 1, c)) {
        const answer = readSlotFlat(solution, size, r, c, 'down');
        if (answer.length >= 2) slots.push({ row: r, col: c, dir: 'down', answer });
      }
    }
  }
  return slots;
}

function validateCrossword(entry) {
  const { title, size, solution, clues } = entry;
  const label = title || 'crossword';
  if (!Array.isArray(solution) || solution.length !== size * size) {
    throw new Error(`${label}: solution must be length ${size * size}`);
  }
  if (!Array.isArray(clues) || clues.length === 0) {
    throw new Error(`${label}: clues missing`);
  }

  // Numbering: shared start cells must share one number; numbers increase in reading order
  const startToNum = new Map();
  for (const clue of clues) {
    const key = `${clue.row},${clue.col}`;
    if (startToNum.has(key) && startToNum.get(key) !== clue.num) {
      throw new Error(
        `${label}: conflicting numbers at (${clue.row},${clue.col}): ${startToNum.get(key)} vs ${clue.num}`,
      );
    }
    startToNum.set(key, clue.num);
  }

  for (const clue of clues) {
    const { num, answer, row, col, dir } = clue;
    const where = `${label} ${num}-${dir}`;
    if (row < 0 || col < 0 || row >= size || col >= size) {
      throw new Error(`${where}: start out of bounds (${row},${col})`);
    }
    const start = solution[row * size + col];
    if (!start || start === '.') {
      throw new Error(`${where}: clue starts on a block at (${row},${col})`);
    }
    if (!answer || String(answer).length === 0) {
      throw new Error(`${where}: empty answer`);
    }
    const gridWord = readSlotFlat(solution, size, row, col, dir);
    if (gridWord !== String(answer).toLowerCase()) {
      throw new Error(
        `${where}: answer "${answer}" ≠ grid "${gridWord}" from (${row},${col}) ${dir}`,
      );
    }
    if (!clue.clue || String(clue.clue).trim().length === 0) {
      throw new Error(`${where}: empty clue text`);
    }
  }

  const slots = extractSlotsFlat(solution, size);
  for (const slot of slots) {
    const match = clues.find(
      (c) => c.row === slot.row && c.col === slot.col && c.dir === slot.dir,
    );
    if (!match) {
      throw new Error(
        `${label}: unclued ${slot.dir} slot "${slot.answer}" at (${slot.row},${slot.col})`,
      );
    }
    if (String(match.answer).toLowerCase() !== slot.answer) {
      throw new Error(
        `${label}: clue at (${slot.row},${slot.col}) ${slot.dir} has "${match.answer}" but grid spells "${slot.answer}"`,
      );
    }
  }
}

function loadIpuzFiles() {
  if (!existsSync(ipuzDir)) {
    throw new Error(`Missing ipuz dir: ${ipuzDir}`);
  }
  const files = readdirSync(ipuzDir)
    .filter((f) => f.endsWith('.ipuz'))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
  if (files.length < TARGET) {
    throw new Error(`Need ≥${TARGET} ipuz files, found ${files.length}`);
  }
  return files.map((f) => ({
    file: f,
    data: JSON.parse(readFileSync(join(ipuzDir, f), 'utf8')),
  }));
}

function convertIpuz(ipuz, index, clues) {
  const sol = ipuz.solution;
  if (!sol || sol.length !== SIZE || sol[0].length !== SIZE) {
    throw new Error(`Bad dimensions in puzzle index ${index}`);
  }
  const { slots } = numberAndSlots(sol);
  if (slots.length === 0) throw new Error(`No slots in puzzle ${index}`);

  const solution = solutionFlat(sol);
  const clueList = slots.map((s) => ({
    num: s.num,
    clue: clueFor(s.answer, clues),
    answer: s.answer.toLowerCase(),
    row: s.row,
    col: s.col,
    dir: s.dir,
  }));

  // Prefer across then down, sorted by number (UI already filters)
  clueList.sort((a, b) => a.num - b.num || (a.dir === 'across' ? -1 : 1));

  const dayOfYear = index + 1;
  const dateKey =
    dayOfYear <= 366 ? mmddFromDoyLeap(dayOfYear) : `x${pad(dayOfYear)}`;

  const title = `${TITLES[index % TITLES.length]} — Day ${dayOfYear}`;

  const entry = {
    dayOfYear,
    dateKey,
    title,
    size: SIZE,
    solution,
    clues: clueList,
  };
  validateCrossword(entry);
  return entry;
}

function emitTs(entries) {
  const header = `/**
 * Static crossword bank — ${entries.length} UNIQUE 5×5 American minis (black squares allowed).
 * Indexed by dayOfYear (1–${Math.min(entries.length, 366)}+) and dateKey (MM-DD, leap-year calendar incl. 02-29).
 * Lookup: pickByDate() in ../dayIndex.ts (dateKey → dayOfYear → stable hash; no 8-puzzle cycle).
 * Generated by src/scripts/generate-mini-crosswords.mjs from crossword-gen/ipuz-out.
 */
import type { CrosswordEntry } from '../types';

export const crosswordBank: CrosswordEntry[] = ${JSON.stringify(entries, null, 2)};
`;
  writeFileSync(outPath, header);
}

function main() {
  const clues = loadClues();
  const files = loadIpuzFiles();
  const seen = new Set();
  const entries = [];

  for (let i = 0; i < files.length; i++) {
    const entry = convertIpuz(files[i].data, i, clues);
    const sig = entry.solution.join('');
    if (seen.has(sig)) {
      console.warn(`Skipping duplicate grid at ${files[i].file}`);
      continue;
    }
    seen.add(sig);
    entries.push(entry);
  }

  if (entries.length < TARGET) {
    throw new Error(`Only ${entries.length} unique puzzles after dedupe; need ≥${TARGET}`);
  }

  emitTs(entries);
  console.log(`Wrote crossword.ts (${entries.length} unique entries)`);
  console.log(`Clue cache keys: ${Object.keys(clues).length}`);

  // Spot-check samples
  const samples = [
    { label: 'doy1 / 01-01', doy: 1, key: '01-01' },
    { label: 'doy100', doy: 100, key: null },
    { label: 'doy365', doy: 365, key: null },
    { label: '02-29 leap', doy: null, key: '02-29' },
    { label: '09-10', doy: null, key: '09-10' },
  ];
  for (const s of samples) {
    const e =
      (s.key && entries.find((x) => x.dateKey === s.key)) ||
      (s.doy && entries.find((x) => x.dayOfYear === s.doy));
    if (!e) {
      console.warn(`MISSING sample ${s.label}`);
      continue;
    }
    validateCrossword(e);
    const across = e.clues.filter((c) => c.dir === 'across').length;
    const down = e.clues.filter((c) => c.dir === 'down').length;
    console.log(
      `OK ${s.label}: "${e.title}" blocks=${e.solution.filter((c) => c === '.').length} clues=${across}A/${down}D sig=${e.solution.join('').slice(0, 12)}…`,
    );
  }

  // Uniqueness across calendar year slice
  const yearSlice = entries.filter((e) => e.dayOfYear >= 1 && e.dayOfYear <= 366);
  const yearSigs = new Set(yearSlice.map((e) => e.solution.join('')));
  console.log(`Year coverage: ${yearSlice.length} entries, ${yearSigs.size} unique grids`);
  if (yearSigs.size < TARGET) {
    throw new Error('Year slice not unique enough');
  }
}

main();
