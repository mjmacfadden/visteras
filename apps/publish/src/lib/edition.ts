import type { Edition, RssStory, ComicStripData } from '../data/types';
import { fetchAllFeeds } from './rss';
import { fetchComics, getComicsPool } from './comics';
import { chicagoDateKey } from './dateFilter';
import { getBirthdaysForDate } from '../data/birthdays';
import { getHistoryForDate } from '../data/history';

function take<T>(arr: T[], n: number): T[] {
  return arr.slice(0, n);
}

export function formatChicagoDateDisplay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(dt);
}

const EMPTY_LEAD: RssStory = {
  id: 'empty-lead',
  title: '',
  description: '',
  url: '#',
  image: null,
  source: '',
  publishedAt: '',
  category: 'local',
};

/**
 * Build the live edition.
 * Default: Grok is the news backbone — skip news RSS merge (placeholders cleared).
 * Comics still fetch. Pass rssEnabled:true to restore RSS-backed news columns.
 */
export async function buildLiveEdition(
  base: Edition,
  opts: { rssEnabled?: boolean; date?: string } = {},
): Promise<{
  edition: Edition;
  feedStatus: { ok: string[]; failed: { id: string; error: string }[] };
  comicsLive: boolean;
  comicsPool: import('../data/types').ComicStripData[];
  rssEnabled: boolean;
}> {
  const editionDate = opts.date || chicagoDateKey();
  const dateDisplay = formatChicagoDateDisplay(editionDate);
  const birthdays = getBirthdaysForDate(editionDate);
  const todayInHistory = getHistoryForDate(editionDate);
  const rssEnabled = opts.rssEnabled === true;

  const comics = await fetchComics();
  const comicsPool = getComicsPool();
  const comicSlots: ComicStripData[] = comics.length
    ? comics
    : base.comics.map((c) => ({
        ...c,
        imageUrl: null,
        link: undefined,
        live: false,
      }));

  if (!rssEnabled) {
    const edition: Edition = {
      ...base,
      date: editionDate,
      dateDisplay,
      birthdays,
      todayInHistory,
      leadStory: EMPTY_LEAD,
      alsoToday: [],
      news: [],
      businessTech: [],
      sports: [],
      comics: comicSlots,
      morningRoundup: null,
      feeds: [],
    };
    return {
      edition,
      feedStatus: { ok: [], failed: [] },
      comicsLive: comics.some((c) => c.live),
      comicsPool,
      rssEnabled: false,
    };
  }

  let feeds = await fetchAllFeeds({
    todayOnlyBuiltIn: true,
    editionDate,
  });

  const needFallback =
    !feeds.news.length && !feeds.businessTech.length && !feeds.sports.length && !feeds.lead.length;
  if (needFallback) {
    feeds = await fetchAllFeeds({ todayOnlyBuiltIn: false, editionDate });
  }

  const news = feeds.news.length ? take(feeds.news, 4) : base.news;
  const businessTech = feeds.businessTech.length
    ? take(feeds.businessTech, 4)
    : base.businessTech;
  const sports = feeds.sports.length ? take(feeds.sports, 4) : base.sports;

  let leadStory: RssStory = base.leadStory;
  if (feeds.lead[0]) leadStory = feeds.lead[0];
  else if (feeds.news[0]) leadStory = feeds.news[0];

  let alsoToday: RssStory[] = base.alsoToday;
  if (feeds.alsoToday.length) alsoToday = take(feeds.alsoToday, 4);
  else if (feeds.news.length > 1) alsoToday = take(feeds.news.slice(1), 4);

  const edition: Edition = {
    ...base,
    date: editionDate,
    dateDisplay,
    birthdays,
    todayInHistory,
    leadStory,
    alsoToday,
    news,
    businessTech,
    sports,
    comics: comicSlots,
    feeds: feeds.feeds || [],
  };

  return {
    edition,
    feedStatus: { ok: feeds.okFeeds, failed: feeds.failedFeeds },
    comicsLive: comics.some((c) => c.live),
    comicsPool,
    rssEnabled: true,
  };
}
