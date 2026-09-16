/**
 * One-shot generator: writes jumble.ts, trivia.ts, crossword.ts with ~100 entries each.
 * Banks are day-indexed (dayOfYear 1..100 + dateKey MM-DD for Jan 1 – Apr 10).
 * Mike refreshes/extends manually every ~3 months.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../data/puzzles');
const COUNT = 100;

function pad(n) {
  return String(n).padStart(2, '0');
}

function mmddFromDayOfYear(doy) {
  // Non-leap: day 1 = Jan 1
  const d = new Date(Date.UTC(2026, 0, doy));
  return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const jumbleWords = [
  ['EDITOR', 'Read the morning paper'],
  ['CHRONICLE', 'Local daily record'],
  ['NORTHBROOK', 'Our hometown'],
  ['MASTHEAD', 'Top of the page'],
  ['HEADLINE', 'Biggest type on A1'],
  ['COLUMN', 'Vertical news strip'],
  ['TYPESET', 'Arrange the letters'],
  ['BROADSHEET', 'Full-size newspaper'],
  ['PRESSRUN', 'When ink hits paper'],
  ['BYLINE', 'Who wrote the story'],
  ['DATELINE', 'Where the story is from'],
  ['OPINION', 'Not straight news'],
  ['COMICS', 'Sunday funnies'],
  ['PUZZLE', 'Challenge for coffee'],
  ['WEATHER', 'Look out the window'],
  ['FORECAST', 'Chance of showers'],
  ['CALENDAR', 'What is on today'],
  ['AGENDA', 'Morning plan'],
  ['SPORTS', 'Back page scores'],
  ['BASEBALL', 'Cubs or Sox'],
  ['FOOTBALL', 'Bears Sunday'],
  ['HOCKEY', 'Blackhawks ice'],
  ['BASKETBALL', 'Bulls at the United Center'],
  ['CROSSWORD', 'Black and white grid'],
  ['JUMBLE', 'Scrambled letters'],
  ['TRIVIA', 'Sports brain teaser'],
  ['CARDINAL', 'Red bird to draw'],
  ['CHICAGO', 'City to the south'],
  ['LAKEFRONT', 'Michigan shore'],
  ['METRA', 'Morning train'],
  ['SUBURBAN', 'Village life'],
  ['LIBRARY', 'Quiet stacks'],
  ['VILLAGE', 'Green Board'],
  ['PARKWAY', 'Tree-lined drive'],
  ['SCHOOL', 'Drop off Jack'],
  ['TEACHER', 'Lesson planner'],
  ['COFFEE', 'First cup'],
  ['BAGEL', 'Breakfast round'],
  ['SUNRISE', 'Eastern glow'],
  ['INKWELL', 'Old reporter tool'],
  ['REPORTER', 'Gets the facts'],
  ['EDITORIAL', 'Masthead voice'],
  ['SECTION', 'News sports arts'],
  ['FRONTAGE', 'Page one real estate'],
  ['GALLEYS', 'Proof pages'],
  ['LINOTYPE', 'Hot metal days'],
  ['NEWSROOM', 'Desk and phones'],
  ['DEADLINE', 'Do not miss it'],
  ['SCOOP', 'Exclusive tip'],
  ['FEATURE', 'Longer read'],
  ['BRIEF', 'Short item'],
  ['WIRECOPY', 'News from the wire'],
  ['LAYOUT', 'Page design'],
  ['FOLIO', 'Page number line'],
  ['RULE', 'Thin black line'],
  ['SERIF', 'Classic letter feet'],
  ['INK', 'Black on cream'],
  ['PAPER', 'Pulp and fiber'],
  ['FOLD', 'Crease the sheet'],
  ['ROUTE', 'Carrier path'],
  ['CARRIER', 'Throws the paper'],
  ['SUNDAY', 'Thickest edition'],
  ['WEEKDAY', 'Morning ritual'],
  ['ARCHIVE', 'Back issues'],
  ['CLIPPING', 'Saved article'],
  ['OBITUARY', 'Life remembered'],
  ['CLASSIFIED', 'Small ads'],
  ['HOROSCOPE', 'Stars say'],
  ['RECIPE', 'Kitchen clip'],
  ['GARDEN', 'Spring plot'],
  ['TRAFFIC', 'Kennedy jam'],
  ['TRANSIT', 'CTA blue line'],
  ['AIRPORT', 'OHare delays'],
  ['MUSEUM', 'Art Institute'],
  ['THEATER', 'Loop show'],
  ['FESTIVAL', 'Taste of Chicago'],
  ['RIVERWALK', 'Downtown stroll'],
  ['SKYLINE', 'Willis view'],
  ['WINDY', 'City nickname'],
  ['PRAIRIE', 'Illinois grass'],
  ['CORNFIELD', 'West of town'],
  ['MAPLE', 'Fall color'],
  ['OAKTREE', 'Village streets'],
  ['SNOWDAY', 'School closed'],
  ['BLIZZARD', 'Lake effect'],
  ['THUNDER', 'Summer storm'],
  ['TORNADO', 'Siren drill'],
  ['HUMIDITY', 'August sticky'],
  ['FROST', 'October lawn'],
  ['AUTUMN', 'Crisp air'],
  ['WINTER', 'Long coat'],
  ['SPRING', 'Tulips up'],
  ['SUMMER', 'Firefly nights'],
  ['HOLIDAY', 'Family table'],
  ['BIRTHDAY', 'Cake and candles'],
  ['HISTORY', 'This day in'],
  ['MEMORY', 'Old photo'],
  ['NEIGHBOR', 'Wave hello'],
  ['FRIENDSHIP', 'Coffee chat'],
  ['FAMILY', 'Jack and home'],
  ['MORNING', 'Paper time'],
];

function scramble(word) {
  const chars = word.replace(/\s/g, '').split('');
  for (let i = chars.length - 1; i > 0; i--) {
    const j = (i * 7 + word.length * 3) % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  // Ensure not identical to answer
  if (chars.join('') === word) chars.reverse();
  return chars.join('');
}

const triviaPool = [
  ['Which MLB team plays at Wrigley Field?', 'Chicago Cubs', 'Baseball'],
  ['What is the nickname of the Chicago Bears defense of 1985?', 'The Monsters of the Midway', 'Football'],
  ['Which NHL team is based in Chicago?', 'Chicago Blackhawks', 'Hockey'],
  ['Michael Jordan wore what number for most of his Bulls career?', '23', 'Basketball'],
  ['Soldier Field is home to which NFL team?', 'Chicago Bears', 'Football'],
  ['The White Sox play in which South Side ballpark?', 'Guaranteed Rate Field (formerly Comiskey)', 'Baseball'],
  ['How many championships did the Bulls win in the 1990s?', 'Six', 'Basketball'],
  ['Who is known as "Mr. Cub"?', 'Ernie Banks', 'Baseball'],
  ['United Center hosts the Bulls and which other team?', 'Blackhawks', 'Multi'],
  ['What lake borders Chicago?', 'Lake Michigan', 'Geography'],
  ['In what year did the Cubs end their World Series drought?', '2016', 'Baseball'],
  ['Walter Payton\'s nickname was?', 'Sweetness', 'Football'],
  ['Which coach led the Bulls dynasty with Phil Jackson?', 'Phil Jackson', 'Basketball'],
  ['The Super Bowl shuffle was recorded by which team?', '1985 Chicago Bears', 'Football'],
  ['Wrigley Field opened in what decade?', '1910s (1914)', 'Baseball'],
  ['Who hit the "Bartman" foul ball series?', 'Steve Bartman incident, 2003 NLCS', 'Baseball'],
  ['Chicago Marathon typically falls in which month?', 'October', 'Running'],
  ['What sport is played at Northwestern\'s Welsh-Ryan Arena?', 'Basketball (and volleyball)', 'College'],
  ['The Blackhawks\' home jersey features which animal?', 'Native American-inspired hawk logo', 'Hockey'],
  ['Ditka coached which NFL franchise?', 'Chicago Bears', 'Football'],
  ['How many bases are on a baseball diamond?', 'Four', 'Baseball'],
  ['A football field is how many yards long (goal to goal)?', '100 yards', 'Football'],
  ['How many players on the court for one NBA team?', 'Five', 'Basketball'],
  ['Hockey uses a puck made primarily of what?', 'Vulcanized rubber', 'Hockey'],
  ['What does RBI stand for?', 'Runs Batted In', 'Baseball'],
  ['What is a hat trick in hockey?', 'Three goals by one player in a game', 'Hockey'],
  ['March Madness refers to which sport?', 'College basketball', 'Basketball'],
  ['The Heisman Trophy is awarded in which sport?', 'College football', 'Football'],
  ['What is the distance of a regulation marathon?', '26.2 miles', 'Running'],
  ['Olympic swimming pools are how many meters long?', '50 meters', 'Swimming'],
  ['In tennis, what comes after deuce if a player scores?', 'Advantage', 'Tennis'],
  ['How many holes in a standard golf round?', '18', 'Golf'],
  ['What color flag ends a NASCAR race?', 'Checkered', 'Auto'],
  ['FIFA World Cup is contested in which sport?', 'Soccer (football)', 'Soccer'],
  ['A strikeout is recorded how in a scorebook often?', 'K', 'Baseball'],
  ['Who holds the NBA career scoring record (as of mid-2020s)?', 'LeBron James', 'Basketball'],
  ['Green Bay Packers are rivals of which Chicago team?', 'Chicago Bears', 'Football'],
  ['What is the oldest continuously operating MLB park?', 'Fenway or Wrigley (Wrigley 1914, Fenway 1912)', 'Baseball'],
  ['Northwestern University is in which Illinois city?', 'Evanston', 'Local'],
  ['The Chicago Fire play which sport?', 'MLS soccer', 'Soccer'],
  ['What river was famously reversed in Chicago?', 'Chicago River', 'Local'],
  ['Soldier Field sits near which museum campus landmark?', 'Field Museum / Adler / Shedd area', 'Local'],
  ['Who was known as "The Fridge" for the Bears?', 'William Perry', 'Football'],
  ['Scottie Pippen was Jordan\'s teammate on which team?', 'Chicago Bulls', 'Basketball'],
  ['What is icing in hockey?', 'Shooting the puck from behind center across the opposing goal line', 'Hockey'],
  ['A perfect game in baseball means?', 'No opposing batter reaches base', 'Baseball'],
  ['How many points is a free throw worth?', 'One', 'Basketball'],
  ['What is the NFL championship game called?', 'Super Bowl', 'Football'],
  ['Stanley Cup belongs to which league?', 'NHL', 'Hockey'],
  ['World Series belongs to which league?', 'MLB', 'Baseball'],
];

// Expand trivia to 100 by rotating variants
function buildTrivia() {
  const out = [];
  for (let i = 0; i < COUNT; i++) {
    const base = triviaPool[i % triviaPool.length];
    const variant = Math.floor(i / triviaPool.length);
    let [q, a, cat] = base;
    if (variant > 0) q = `${q} (edition ${variant + 1})`;
    out.push({
      dayOfYear: i + 1,
      dateKey: mmddFromDayOfYear(i + 1),
      question: q,
      answer: a,
      category: cat,
    });
  }
  return out;
}

function buildJumble() {
  const out = [];
  for (let i = 0; i < COUNT; i++) {
    const [answer, clue] = jumbleWords[i % jumbleWords.length];
    out.push({
      dayOfYear: i + 1,
      dateKey: mmddFromDayOfYear(i + 1),
      clue,
      scrambled: scramble(answer),
      answer,
    });
  }
  return out;
}

// Hand-validated 5×5 American crossword minis (true word squares:
// rows == columns, every slot a real English word).
function wordSquare(title, words, acrossClues, downClues) {
  if (words.length !== 5 || words.some((w) => w.length !== 5)) {
    throw new Error(`${title}: need five 5-letter words`);
  }
  // Enforce true word square (transpose equals rows)
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (words[r][c] !== words[c][r]) {
        throw new Error(`${title}: not a word square at (${r},${c})`);
      }
    }
  }
  const solution = words.join('').split('');
  const clues = [];
  words.forEach((answer, i) => {
    clues.push({
      num: i === 0 ? 1 : i + 5,
      clue: acrossClues[i],
      answer,
      row: i,
      col: 0,
      dir: 'across',
    });
  });
  words.forEach((answer, i) => {
    clues.push({
      num: i + 1,
      clue: downClues[i],
      answer,
      row: 0,
      col: i,
      dir: 'down',
    });
  });
  return { title, size: 5, solution, clues };
}

const goodCrosswords = [
  wordSquare(
    'Warm Type',
    ['HEART', 'EMBER', 'ABUSE', 'RESIN', 'TREND'],
    [
      'Valentine symbol',
      'Fireplace leftover',
      'Bad-mouth',
      'Pine sap product',
      'Fashion direction',
    ],
    [
      'Core of the matter',
      'Glowing coal',
      'Misuse',
      'Amber source',
      'Chart-topper path',
    ],
  ),
  wordSquare(
    'Front Page',
    ['PAPER', 'ARENA', 'PEARL', 'ENROL', 'RALLY'],
    [
      'Newsprint sheet',
      'Sports venue',
      'Oyster gem',
      'Sign up, British-style',
      'Campaign gathering',
    ],
    [
      'Broadsheet',
      'United Center, e.g.',
      'June birthstone',
      'Register for a class',
      'Pep-talk meeting',
    ],
  ),
  wordSquare(
    'Sports Page',
    ['GAMES', 'ARENA', 'METAL', 'ENACT', 'SALTS'],
    [
      'Ballpark contests',
      'Hockey venue',
      'Medal material',
      'Pass into law',
      'Seasons food',
    ],
    [
      'Board or video ___',
      'United Center bowl',
      'Tin or copper',
      'Put on the books',
      'Epsom and table',
    ],
  ),
  wordSquare(
    'Box Score',
    ['SCORE', 'CANOE', 'ONION', 'ROOMS', 'EENSY'],
    [
      'Final tally',
      'Quiet watercraft',
      'Burger topper',
      'Hotel units',
      'Teensy, in crosswords',
    ],
    [
      'Music notation sheet',
      'Camp paddle boat',
      'Layers vegetable',
      'Makes space for',
      'Itsy-bitsy cousin',
    ],
  ),
  wordSquare(
    'Cafe Scene',
    ['IMAGE', 'MOCHA', 'ACTOR', 'GHOST', 'EARTH'],
    [
      'Photo or icon',
      'Chocolatey espresso drink',
      'Stage player',
      'Halloween costume',
      'Third rock from the sun',
    ],
    [
      'Public perception',
      'Coffee-shop order',
      'Movie cast member',
      'Spectral visitor',
      'Soil underfoot',
    ],
  ),
  wordSquare(
    'Night Sky',
    ['BLAST', 'LUNAR', 'ANGLE', 'SALON', 'TREND'],
    [
      'Explosive sound',
      'Of the moon',
      'Geometry corner',
      'Beauty parlor',
      'Fashion direction',
    ],
    [
      'Detonate',
      'Moon-related',
      'Fishhook feature',
      'Hair studio',
      'What is trending',
    ],
  ),
  wordSquare(
    'Arts Desk',
    ['SOLAR', 'OPERA', 'LEVEL', 'AREAL', 'RALLY'],
    [
      'Of the sun',
      'Lyric stage work',
      'Even; tier',
      'Of an area',
      'Campaign gathering',
    ],
    [
      'Sun-powered',
      'La Boheme, e.g.',
      'Spirit level reading',
      'Geographic, as a map',
      'Pep-talk meeting',
    ],
  ),
  wordSquare(
    'Tone Down',
    ['HEART', 'EMBER', 'ABASE', 'RESIN', 'TREND'],
    [
      'Center of feeling',
      'Glowing remnant',
      'Humble; lower',
      'Tree secretion',
      'Market direction',
    ],
    [
      'Organ of affection',
      'Coal in the grate',
      'Bring down a peg',
      'Varnish base',
      'Social media wave',
    ],
  ),
];

/** Read letters from solution starting at (row,col) in dir until block or edge. */
function readSlot(solution, size, row, col, dir) {
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

/** Extract every across/down slot of length >= 2 from the grid. */
function extractSlots(solution, size) {
  const slots = [];
  const isLetter = (r, c) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return false;
    const ch = solution[r * size + c];
    return Boolean(ch && ch !== '.');
  };
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isLetter(r, c)) continue;
      if (!isLetter(r, c - 1)) {
        const answer = readSlot(solution, size, r, c, 'across');
        if (answer.length >= 2) slots.push({ row: r, col: c, dir: 'across', answer });
      }
      if (!isLetter(r - 1, c)) {
        const answer = readSlot(solution, size, r, c, 'down');
        if (answer.length >= 2) slots.push({ row: r, col: c, dir: 'down', answer });
      }
    }
  }
  return slots;
}

/**
 * Fail loudly if any clue answer ≠ grid spelling, clue starts on a block,
 * answer is empty, or any grid slot (len>=2) is missing/mismatched in clues.
 */
function validateCrossword(entry) {
  const { title, size, solution, clues } = entry;
  const label = title || 'crossword';
  if (!Array.isArray(solution) || solution.length !== size * size) {
    throw new Error(`${label}: solution must be length ${size * size}`);
  }
  if (!Array.isArray(clues) || clues.length === 0) {
    throw new Error(`${label}: clues missing`);
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
    const gridWord = readSlot(solution, size, row, col, dir);
    if (gridWord !== answer) {
      throw new Error(
        `${where}: answer "${answer}" ≠ grid "${gridWord}" from (${row},${col}) ${dir}`,
      );
    }
  }

  const slots = extractSlots(solution, size);
  for (const slot of slots) {
    const match = clues.find(
      (c) => c.row === slot.row && c.col === slot.col && c.dir === slot.dir,
    );
    if (!match) {
      throw new Error(
        `${label}: unclued ${slot.dir} slot "${slot.answer}" at (${slot.row},${slot.col})`,
      );
    }
    if (match.answer !== slot.answer) {
      throw new Error(
        `${label}: clue at (${slot.row},${slot.col}) ${slot.dir} has "${match.answer}" but grid spells "${slot.answer}"`,
      );
    }
  }
}

function buildCrossword() {
  for (const tmpl of goodCrosswords) {
    validateCrossword(tmpl);
  }

  const out = [];
  for (let i = 0; i < COUNT; i++) {
    const base = goodCrosswords[i % goodCrosswords.length];
    const entry = {
      dayOfYear: i + 1,
      dateKey: mmddFromDayOfYear(i + 1),
      title: `${base.title} — Day ${i + 1}`,
      size: base.size,
      solution: [...base.solution],
      clues: base.clues.map((c) => ({ ...c })),
    };
    validateCrossword(entry);
    out.push(entry);
  }
  return out;
}

function emitTs(name, typeName, data, extraHeader = '') {
  const header = `/**
 * Static ${name} bank — ${data.length} entries, indexed by dayOfYear (1–${data.length}) and dateKey (MM-DD).
 * Lookup: pickByDate() in ../dayIndex.ts
 * Maintenance: Mike refreshes/extends this bank manually every ~3 months.
 * ${extraHeader}
 */
import type { ${typeName} } from '../types';

export const ${name}Bank: ${typeName}[] = ${JSON.stringify(data, null, 2)};
`;
  writeFileSync(join(outDir, `${name}.ts`), header);
  console.log(`Wrote ${name}.ts (${data.length} entries)`);
}

const jumble = buildJumble();
const trivia = buildTrivia();
emitTs('jumble', 'JumbleEntry', jumble);
emitTs('trivia', 'TriviaEntry', trivia);
// Crossword bank is generated separately (≥366 unique American minis):
//   python3 src/scripts/crossword-gen/convert_ipuz_to_bank.py
// (converts crossword-gen/ipuz-out → data/puzzles/crossword.ts)
console.log('Skipped crossword.ts — use crossword-gen/convert_ipuz_to_bank.py');
console.log('Done.');
