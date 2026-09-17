/**
 * Client-side edition date refresh for static builds.
 * Build-time HTML may bake yesterday's Chicago date; on load we resolve
 * America/Chicago "today" and rewrite date-dependent paper sections.
 */
import QRCode from 'qrcode';
import { puzzlesForDate } from '../data/puzzles';
import { getBirthdaysForDate } from '../data/birthdays';
import { getHistoryForDate } from '../data/history';
import type { CrosswordEntry, JumbleEntry, TriviaEntry, HistoryItem, BirthdayItem } from '../data/types';
import { chicagoDateKey } from './dateFilter';
import { formatChicagoDateDisplay } from './edition';
import { answersUrlForDate } from './site';

function escapeHtml(t: string) {
  return (t || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function crosswordHtml(puzzle: CrosswordEntry): string {
  const size = puzzle.size;
  const clueNums = new Map<string, number>();
  for (const c of puzzle.clues) {
    clueNums.set(`${c.row},${c.col}`, c.num);
  }
  const across = puzzle.clues.filter((c) => c.dir === 'across');
  const down = puzzle.clues.filter((c) => c.dir === 'down');

  const cells = puzzle.solution
    .map((cell, i) => {
      const row = Math.floor(i / size);
      const col = i % size;
      const isBlock = cell === '.';
      const num = clueNums.get(`${row},${col}`);
      const numHtml =
        !isBlock && num !== undefined ? `<span class="num">${escapeHtml(String(num))}</span>` : '';
      return `<div class="crossword-cell${isBlock ? ' block' : ''}">${numHtml}</div>`;
    })
    .join('');

  const acrossItems = across
    .map((c) => `<li value="${c.num}">${escapeHtml(c.clue)}</li>`)
    .join('');
  const downItems = down.map((c) => `<li value="${c.num}">${escapeHtml(c.clue)}</li>`).join('');

  return `<section class="crossword-box" aria-label="Crossword">
  <h2 class="section-label">Crossword · ${escapeHtml(puzzle.title)}</h2>
  <div class="crossword-grid" style="grid-template-columns: repeat(${size}, 1.35rem);">
    ${cells}
  </div>
  <div class="clue-columns">
    <div>
      <strong class="clue-heading">Across</strong>
      <ol class="clue-list">${acrossItems}</ol>
    </div>
    <div>
      <strong class="clue-heading">Down</strong>
      <ol class="clue-list">${downItems}</ol>
    </div>
  </div>
</section>`;
}

function jumbleHtml(puzzle: JumbleEntry, heading: string): string {
  const scrambledLetters = puzzle.scrambled.replace(/\s+/g, '').toUpperCase().split('');
  const answerLen = puzzle.answer.replace(/\s+/g, '').length;
  const hintText = puzzle.clue.toLowerCase().startsWith('hint:')
    ? puzzle.clue
    : `Hint: ${puzzle.clue}`;
  const tiles = scrambledLetters
    .map((ch) => `<span class="jumble-tile">${escapeHtml(ch)}</span>`)
    .join('');
  const blanks = Array.from({ length: answerLen }, () => '<span class="jumble-blank"></span>').join(
    '',
  );

  return `<section class="jumble-box" aria-label="${escapeHtml(heading)}">
  <h2 class="section-label">${escapeHtml(heading)}</h2>
  <div class="jumble-word-block">
    <div class="jumble-tiles" aria-label="Scrambled: ${escapeHtml(puzzle.scrambled)}">${tiles}</div>
    <div class="jumble-blanks" aria-label="${answerLen}-letter answer blanks">${blanks}</div>
  </div>
  <p class="jumble-clue" title="Upside-down hint">${escapeHtml(hintText)}</p>
</section>`;
}

function triviaHtml(trivia: TriviaEntry[]): string {
  const items = trivia.slice(0, 3);
  const list = items
    .map(
      (t) => `<li class="trivia-item">
        <span class="trivia-cat">${escapeHtml(t.category)}</span>
        <p class="trivia-question">${escapeHtml(t.question)}</p>
      </li>`,
    )
    .join('');
  return `<section class="trivia-box" aria-label="Sports trivia">
  <h2 class="section-label">Sports Trivia</h2>
  <ol class="trivia-list">${list}</ol>
</section>`;
}

function historyHtml(history: HistoryItem[]): string {
  const items = history
    .map(
      (h) =>
        `<li><strong>${escapeHtml(String(h.year))} —</strong> ${escapeHtml(h.text)}</li>`,
    )
    .join('');
  return `<section class="history-box" aria-label="Today in history">
  <h2 class="section-label">Today in History</h2>
  <ul class="feature-list">${items}</ul>
</section>`;
}

function birthdaysHtml(birthdays: BirthdayItem[]): string {
  const items = birthdays
    .map((b) => {
      const note = b.note ? ` — ${escapeHtml(b.note)}` : '';
      return `<li><strong>${escapeHtml(b.name)}</strong> (${escapeHtml(String(b.year))})${note}</li>`;
    })
    .join('');
  return `<section class="birthdays-box" aria-label="Famous birthdays">
  <h2 class="section-label">Famous Birthdays</h2>
  <ul class="feature-list">${items}</ul>
</section>`;
}

async function updateAnswersQr(isoDate: string) {
  const url = answersUrlForDate(isoDate);
  const caption = `Scan for puzzle answers · ${isoDate}`;
  let svg = '';
  try {
    svg = await QRCode.toString(url, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#1a1a1a', light: '#00000000' },
    });
  } catch (err) {
    console.warn('[applyEditionDate] QR generation failed', err);
  }

  document.querySelectorAll<HTMLElement>('[data-answers-qr]').forEach((root) => {
    const svgHost = root.querySelector('.answers-qr-svg');
    if (svgHost && svg) svgHost.innerHTML = svg;

    const captionLink = root.querySelector<HTMLAnchorElement>('.answers-qr-caption a');
    if (captionLink) {
      captionLink.href = url;
      captionLink.textContent = caption;
    }

    const urlLink = root.querySelector<HTMLAnchorElement>('.answers-qr-url a');
    if (urlLink) {
      urlLink.href = url;
      urlLink.textContent = url;
    }
  });
}

function updateDateDisplays(isoDate: string, dateDisplay: string) {
  document.body.dataset.editionDate = isoDate;

  document.querySelectorAll<HTMLElement>('.masthead-date-line > span:first-child').forEach((el) => {
    el.textContent = dateDisplay;
  });

  document.querySelectorAll<HTMLElement>('.running-head span:last-child').forEach((el) => {
    el.textContent = dateDisplay;
  });

  // Product browser title — never the newspaper masthead (THE DAILY MIKE / custom).
  document.title = `Visteras Publish — ${dateDisplay}`;
}

function updatePuzzles(isoDate: string) {
  const dateObj = new Date(`${isoDate}T12:00:00`);
  const { crossword, jumbles, trivia } = puzzlesForDate(dateObj);

  document.querySelectorAll('.game-cell.game-crossword').forEach((cell) => {
    cell.innerHTML = crosswordHtml(crossword);
  });

  document.querySelectorAll('.jumble-stack').forEach((stack) => {
    stack.innerHTML = jumbles
      .map((j, i) => jumbleHtml(j, `Jumble ${i + 1}`))
      .join('');
  });

  document.querySelectorAll('.game-cell.game-trivia').forEach((cell) => {
    cell.innerHTML = triviaHtml(trivia);
  });
}

function updateHistoryAndBirthdays(isoDate: string) {
  const history = getHistoryForDate(isoDate);
  const birthdays = getBirthdaysForDate(isoDate);

  document.querySelectorAll('.feature-cell.feature-history').forEach((cell) => {
    cell.innerHTML = historyHtml(history);
  });

  document.querySelectorAll('.feature-cell.feature-birthdays').forEach((cell) => {
    cell.innerHTML = birthdaysHtml(birthdays);
  });
}

export type ApplyEditionDateOptions = {
  /** When true, rewrite even if body already has today's key. Default true for static safety. */
  force?: boolean;
  /** Called after DOM updates (e.g. schedulePaginate). */
  onApplied?: () => void;
};

/**
 * Resolve America/Chicago today and refresh date-dependent paper chrome + features.
 * @returns the active ISO date key, or null if skipped (same day and !force).
 */
export async function applyEditionDate(
  opts: ApplyEditionDateOptions = {},
): Promise<string | null> {
  const force = opts.force !== false;
  const today = chicagoDateKey();
  const baked = document.body.dataset.editionDate || '';

  if (!force && baked === today) {
    return null;
  }

  const dateDisplay = formatChicagoDateDisplay(today);
  updateDateDisplays(today, dateDisplay);
  updatePuzzles(today);
  updateHistoryAndBirthdays(today);
  await updateAnswersQr(today);

  opts.onApplied?.();
  return today;
}
