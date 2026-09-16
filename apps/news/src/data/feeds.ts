/**
 * Starter RSS feed list for The Daily Mike (Phase 2-lite).
 * Headlines + short excerpts + source link only — no full-article republish.
 * Feeds that fail at build time are skipped; placeholders remain.
 */
export type FeedSection = 'news' | 'businessTech' | 'sports' | 'lead' | 'alsoToday';

export interface FeedConfig {
  id: string;
  name: string;
  url: string;
  section: FeedSection;
  /** Max items to keep from this feed after normalize. */
  limit?: number;
}

export const NEWS_FEEDS: FeedConfig[] = [
  // World / national news
  {
    id: 'npr-news',
    name: 'NPR News',
    url: 'https://feeds.npr.org/1001/rss.xml',
    section: 'news',
    limit: 6,
  },
  {
    id: 'bbc-world',
    name: 'BBC World',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    section: 'news',
    limit: 6,
  },
  {
    id: 'nyt-home',
    name: 'NYT Home Page',
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
    section: 'lead',
    limit: 4,
  },
  {
    id: 'nyt-us',
    name: 'NYT U.S.',
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/US.xml',
    section: 'news',
    limit: 4,
  },
  // Business / tech
  {
    id: 'bbc-business',
    name: 'BBC Business',
    url: 'https://feeds.bbci.co.uk/news/business/rss.xml',
    section: 'businessTech',
    limit: 4,
  },
  {
    id: 'ars',
    name: 'Ars Technica',
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    section: 'businessTech',
    limit: 4,
  },
  {
    id: 'verge',
    name: 'The Verge',
    url: 'https://www.theverge.com/rss/index.xml',
    section: 'businessTech',
    limit: 4,
  },
  {
    id: 'hn',
    name: 'Hacker News',
    url: 'https://hnrss.org/frontpage',
    section: 'businessTech',
    limit: 3,
  },
  // Sports
  {
    id: 'espn',
    name: 'ESPN',
    url: 'https://www.espn.com/espn/rss/news',
    section: 'sports',
    limit: 6,
  },
  {
    id: 'npr-also',
    name: 'NPR (briefs)',
    url: 'https://feeds.npr.org/1002/rss.xml',
    section: 'alsoToday',
    limit: 4,
  },
];
