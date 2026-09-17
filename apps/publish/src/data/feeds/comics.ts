/**
 * Comics RSS feeds (best-effort). Prefer public creator / non-scraped feeds.
 * Hotlink image URLs from the feed and credit + link out — do not re-host strips.
 * Note: many GoComics-backed comicsrss.com feeds were halted after copyright notices.
 */
export interface ComicFeedConfig {
  id: string;
  title: string;
  /** Display credit when feed omits one */
  credit: string;
  url: string;
}

/** Comic feed catalog (display capped at MAX_COMICS_ON_PAGE = two most current). */
export const COMIC_FEEDS: ComicFeedConfig[] = [
  {
    id: 'xkcd',
    title: 'xkcd',
    credit: 'Randall Munroe',
    url: 'https://xkcd.com/rss.xml',
  },
  {
    id: 'smbc',
    title: 'SMBC',
    credit: 'Zach Weinersmith',
    url: 'https://www.smbc-comics.com/comic/rss',
  },
  {
    id: 'oatmeal',
    title: 'The Oatmeal',
    credit: 'Matthew Inman',
    url: 'https://theoatmeal.com/feed/rss',
  },
  {
    id: 'newyorker-daily',
    title: 'New Yorker Daily Cartoon',
    credit: 'The New Yorker',
    url: 'https://www.newyorker.com/feed/cartoons/daily-cartoon/rss',
  },
];

/** Last-page comics row: two strips side by side (most current by pub date). */
export const MAX_COMICS_ON_PAGE = 2;

export const DEFAULT_ENABLED_COMIC_IDS = COMIC_FEEDS.map((f) => f.id);
