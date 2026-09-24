import { pickByDate } from '../dayIndex';
import { jumbleBank } from './jumble';
import { triviaBank } from './trivia';
import { crosswordBank } from './crossword';
import { jokeBank } from './jokes';
import type { CrosswordEntry, JokeEntry, JumbleEntry, TriviaEntry } from '../types';

export { jumbleBank, triviaBank, crosswordBank, jokeBank };

/** Three distinct jumbles for a date (day pick, then next bank slots). */
export function jumbleTrioForDate(date: Date = new Date()): JumbleEntry[] {
  if (!jumbleBank.length) return [];
  const primary = pickByDate(jumbleBank, date);
  let start = jumbleBank.findIndex(
    (e) => e.dateKey === primary.dateKey && e.dayOfYear === primary.dayOfYear,
  );
  if (start < 0) start = jumbleBank.indexOf(primary);
  if (start < 0) start = 0;

  const out: JumbleEntry[] = [];
  const seen = new Set<string>();
  for (let step = 0; out.length < 3 && step < jumbleBank.length; step++) {
    const e = jumbleBank[(start + step) % jumbleBank.length]!;
    const key = `${e.scrambled}|${e.answer}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/** Three distinct trivia items for a date (starting at the day's pick, then next bank slots). */
export function triviaTrioForDate(date: Date = new Date()): TriviaEntry[] {
  if (!triviaBank.length) return [];
  const primary = pickByDate(triviaBank, date);
  let start = triviaBank.findIndex(
    (e) => e.dateKey === primary.dateKey && e.dayOfYear === primary.dayOfYear,
  );
  if (start < 0) start = triviaBank.indexOf(primary);
  if (start < 0) start = 0;

  const out: TriviaEntry[] = [];
  const seen = new Set<string>();
  for (let step = 0; out.length < 3 && step < triviaBank.length; step++) {
    const e = triviaBank[(start + step) % triviaBank.length]!;
    const key = `${e.question}|${e.answer}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export function puzzlesForDate(date: Date = new Date()): {
  jumble: JumbleEntry;
  jumbles: JumbleEntry[];
  trivia: TriviaEntry[];
  crossword: CrosswordEntry;
  joke: JokeEntry;
} {
  const jumbles = jumbleTrioForDate(date);
  return {
    jumble: jumbles[0] ?? pickByDate(jumbleBank, date),
    jumbles,
    trivia: triviaTrioForDate(date),
    crossword: pickByDate(crosswordBank, date),
    joke: pickByDate(jokeBank, date),
  };
}
