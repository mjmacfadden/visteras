/**
 * Royko / The Daily Mike edition & content types.
 * Stories are RSS-shaped so the ingestion layer can drop in normalized feed items.
 */

export type StoryCategory = 'news' | 'business' | 'tech' | 'sports' | 'local' | 'national' | 'world';

export type StoryContentBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'image'; src: string; alt?: string };

/** Normalized RSS-like item — primary news backbone. */
export interface RssStory {
  id: string;
  title: string;
  description: string;
  paragraphs?: string[];
  blocks?: StoryContentBlock[];
  url: string;
  image?: string | null;
  source: string;
  publishedAt: string; // ISO
  category: StoryCategory;
}

export interface WeatherConfig {
  zip: string;
  locationLabel: string;
  /** Public WU page used for iframe / link-out (no API key). */
  wundergroundUrl: string;
  /** Optional official embed snippet URL if Mike pastes one later. */
  embedSrc?: string | null;
  /** Print / offline fallback temps (not the long-term live source). */
  fallback: {
    highF: number;
    lowF: number;
    summary: string;
  };
}

export interface AgendaItem {
  time: string;
  title: string;
  note?: string;
}

/** @deprecated Prefer ComicStripData — kept for placeholder editions. */
export interface ComicPlaceholder {
  id: string;
  title: string;
  credit: string;
  caption: string;
}

/** Live or fallback comic strip slot. */
export interface ComicStripData {
  id: string;
  feedId?: string;
  title: string;
  credit: string;
  caption: string;
  /** Hotlinked image URL from RSS (do not re-host long-term). */
  imageUrl?: string | null;
  /** Link to publisher / strip page. */
  link?: string;
  /** True when fetched from a live feed. */
  live?: boolean;
  /** Item pub date (ISO) when known — used to pick the most current strips. */
  publishedAt?: string | null;
}

export interface HistoryItem {
  year: number;
  text: string;
}

export interface BirthdayItem {
  name: string;
  year: number;
  note?: string;
}

export interface Edition {
  date: string; // YYYY-MM-DD
  dateDisplay: string;
  volume: number;
  number: number;
  weather: WeatherConfig;
  agenda: AgendaItem[];
  /** Optional short Grok-style box — secondary to RSS headlines. */
  morningRoundup?: {
    headline: string;
    paragraphs: string[];
    imageCaption?: string;
  } | null;
  /** RSS-shaped lead + section stories */
  leadStory: RssStory;
  alsoToday: RssStory[];
  news: RssStory[];
  businessTech: RssStory[];
  sports: RssStory[];
  comics: ComicStripData[];
  todayInHistory: HistoryItem[];
  birthdays: BirthdayItem[];
  feeds?: { id: string; name: string; section?: string; url: string; stories: RssStory[] }[];
}

export interface JumbleEntry {
  dayOfYear: number; // 1–365
  dateKey: string; // MM-DD
  clue: string;
  scrambled: string;
  answer: string;
}

export interface TriviaEntry {
  dayOfYear: number;
  dateKey: string;
  question: string;
  answer: string;
  category: string;
}

export interface CrosswordClue {
  num: number;
  clue: string;
  answer: string;
  row: number;
  col: number;
  dir: 'across' | 'down';
}

/** Simple themed mini crossword (typically 5×5 or 9×9 with sparse fills). */
export interface CrosswordEntry {
  dayOfYear: number;
  dateKey: string;
  title: string;
  size: number;
  /** Row-major: letters or '.' for black / empty unused cells. Lowercase = solution. */
  solution: string[];
  clues: CrosswordClue[];
}

export interface JokeEntry {
  dayOfYear: number;
  dateKey: string;
  setup: string;
  punchline: string;
  category?: string;
}

