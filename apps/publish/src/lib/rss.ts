/**
 * RSS fetch + normalize → RssStory.
 * Used at build time and on client side. Failures are skipped so app never breaks.
 */
import { XMLParser } from 'fast-xml-parser';
import type { RssStory, StoryCategory } from '../data/types';
import { NEWS_FEEDS, type FeedConfig, type FeedSection } from '../data/feeds';
import { isSameChicagoDay } from './dateFilter';
import { fetchWithCorsFallback } from './corsFetch';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '__cdata',
  trimValues: true,
});

export interface FeedResult {
  id: string;
  name: string;
  section: FeedSection | string;
  url: string;
  stories: RssStory[];
}

export interface FetchedSections {
  lead: RssStory[];
  alsoToday: RssStory[];
  news: RssStory[];
  businessTech: RssStory[];
  sports: RssStory[];
  customFeeds?: CustomFeedResult[];
  feeds: FeedResult[];
  okFeeds: string[];
  failedFeeds: { id: string; error: string }[];
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function textOf(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (o.__cdata != null) return textOf(o.__cdata);
    if (o['#text'] != null) return textOf(o['#text']);
  }
  return '';
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&hellip;/gi, '…')
    .replace(/&lsquo;|&rsquo;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(html: string): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<div class="subscription-widget[\s\S]*?<\/div>\s*<\/div>/gi, '')
    .replace(/<figure[\s\S]*?<\/figure>/gi, '')
    .replace(/<figcaption[\s\S]*?<\/figcaption>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return decodeHtmlEntities(cleaned);
}

function cleanParagraphHtml(html: string): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<div class="subscription-widget[\s\S]*?<\/div>\s*<\/div>/gi, '')
    .replace(/<figure[\s\S]*?<\/figure>/gi, '')
    .replace(/<figcaption[\s\S]*?<\/figcaption>/gi, '')
    .replace(/<a class="footnote-anchor"[\s\S]*?<\/a>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return decodeHtmlEntities(cleaned);
}

export function extractStoryBlocks(descRaw: string, contentRaw: string): {
  blocks: StoryContentBlock[];
  paragraphs: string[];
  leadImage: string | null;
} {
  const subtitle = cleanParagraphHtml(descRaw || '');
  const html = (contentRaw || '').trim() || (descRaw || '').trim();

  const cleanHtml = html
    .replace(/<div class="subscription-widget[\s\S]*?<\/div>\s*<\/div>/gi, '')
    .replace(/<div class="pencraft[\s\S]*?<\/div>\s*<\/div>/gi, '')
    .replace(/<a class="footnote-anchor"[\s\S]*?<\/a>/gi, '');

  const tokens = cleanHtml.split(/(<img[^>]+src=["'][^"']+["'][^>]*>)/gi);
  const rawBlocks: StoryContentBlock[] = [];
  const paragraphs: string[] = [];
  let leadImage: string | null = null;

  if (subtitle && subtitle.length > 5) {
    rawBlocks.push({ type: 'paragraph', text: subtitle });
    paragraphs.push(subtitle);
  }

  for (const token of tokens) {
    if (!token.trim()) continue;
    const imgMatch = token.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch) {
      const src = imgMatch[1];
      if (src && !src.includes('tracker') && !src.includes('beacon') && !src.includes('data:image/svg')) {
        rawBlocks.push({ type: 'image', src });
        if (!leadImage) leadImage = src;
      }
    } else {
      const paras = token
        .replace(/<br\s*\/?>/gi, '\n')
        .split(/<\/(?:p|h[1-6]|blockquote|li|div|figure)>\s*|<hr\s*\/?>|\n\s*\n/i)
        .map((p) => cleanParagraphHtml(p))
        .filter((p) => {
          if (!p || p.length < 2) return false;
          if (/^(?:subscribe|restack|share this post|leave a comment)\b/i.test(p)) return false;
          if (p.includes('pencraft') || p.includes('data-component-name')) return false;
          return true;
        });
      for (const p of paras) {
        rawBlocks.push({ type: 'paragraph', text: p });
        paragraphs.push(p);
      }
    }
  }

  if (!rawBlocks.length) {
    const fallback = cleanParagraphHtml(descRaw || contentRaw || '');
    if (fallback) {
      rawBlocks.push({ type: 'paragraph', text: fallback });
      paragraphs.push(fallback);
    }
  }

  return { blocks: rawBlocks, paragraphs, leadImage };
}

function pickLink(item: Record<string, unknown>): string {
  const link = item.link;
  if (typeof link === 'string') return link;
  if (link && typeof link === 'object') {
    const o = link as Record<string, unknown>;
    if (o['@_href']) return String(o['@_href']);
    if (o['#text']) return String(o['#text']);
  }
  const id = item.guid ?? item.id;
  if (typeof id === 'string' && id.startsWith('http')) return id;
  if (id && typeof id === 'object') {
    const t = textOf(id);
    if (t.startsWith('http')) return t;
  }
  return '';
}

function pickImage(item: Record<string, unknown>): string | null {
  const media = item['media:content'] ?? item['media:thumbnail'];
  for (const m of asArray(media)) {
    if (m && typeof m === 'object' && (m as Record<string, unknown>)['@_url']) {
      return String((m as Record<string, unknown>)['@_url']);
    }
  }
  const enclosure = item.enclosure;
  for (const e of asArray(enclosure)) {
    if (e && typeof e === 'object') {
      const o = e as Record<string, unknown>;
      const type = String(o['@_type'] || '');
      if (type.startsWith('image') && o['@_url']) return String(o['@_url']);
    }
  }
  const desc = textOf(item.description ?? item.summary ?? item.content);
  const m = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m?.[1] ?? null;
}

function sectionToCategory(section: FeedSection): StoryCategory {
  switch (section) {
    case 'sports':
      return 'sports';
    case 'businessTech':
      return 'tech';
    case 'alsoToday':
      return 'national';
    case 'lead':
      return 'national';
    default:
      return 'news';
  }
}

function safeIdKey(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function normalizeItem(
  item: Record<string, unknown>,
  feed: FeedConfig,
  index: number,
): RssStory | null {
  const title = stripHtml(textOf(item.title));
  const url = pickLink(item);
  if (!title || !url) return null;
  const rawDesc = textOf(item.description ?? item.summary ?? '');
  const rawContent = textOf(item['content:encoded'] ?? item.content ?? '');
  const { blocks, paragraphs, leadImage } = extractStoryBlocks(rawDesc, rawContent);
  const image = pickImage(item) || leadImage;
  const publishedAt =
    textOf(item.pubDate ?? item.published ?? item.updated ?? item['dc:date']) ||
    new Date().toISOString();
  return {
    id: `${feed.id}-${index}-${safeIdKey(url)}`,
    title,
    description: paragraphs.join('\n\n'),
    paragraphs,
    blocks,
    url,
    image,
    source: feed.name,
    publishedAt,
    category: sectionToCategory(feed.section),
  };
}

function extractItems(doc: unknown): Record<string, unknown>[] {
  const root = doc as Record<string, unknown>;
  const rss = root.rss as Record<string, unknown> | undefined;
  if (rss?.channel) {
    const channel = rss.channel as Record<string, unknown>;
    return asArray(channel.item) as Record<string, unknown>[];
  }
  const feed = root.feed as Record<string, unknown> | undefined;
  if (feed) {
    return asArray(feed.entry) as Record<string, unknown>[];
  }
  return [];
}

async function fetchRss2Json(feed: FeedConfig): Promise<RssStory[]> {
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok' || !Array.isArray(data.items)) {
    throw new Error(data.message || 'rss2json conversion failed');
  }
  return data.items
    .map((item: any, idx: number): RssStory | null => {
      const title = stripHtml(textOf(item.title));
      const link = item.link || item.guid || '';
      if (!title || !link) return null;
      const rawDesc = textOf(item.description || '');
      const rawContent = textOf(item.content || '');
      const { blocks, paragraphs, leadImage } = extractStoryBlocks(rawDesc, rawContent);
      const image =
        item.thumbnail ||
        (item.enclosure && item.enclosure.link ? String(item.enclosure.link) : null) ||
        leadImage ||
        null;
      const publishedAt =
        textOf(item.pubDate || item.published || item.updated) ||
        new Date().toISOString();
      return {
        id: `${feed.id}-${idx}-${safeIdKey(link)}`,
        title,
        description: paragraphs.join('\n\n'),
        paragraphs,
        blocks,
        url: link,
        image,
        source: feed.name,
        publishedAt,
        category: sectionToCategory(feed.section),
      };
    })
    .filter((s): s is RssStory => s !== null);
}

export async function fetchFeed(
  feed: FeedConfig,
  opts: { todayOnly?: boolean; editionDate?: string } = {},
): Promise<RssStory[]> {
  let candidates: RssStory[] = [];
  let directError: any = null;

  // 1. Try direct XML fetch + parser
  try {
    const res = await fetchWithCorsFallback(
      feed.url,
      {
        headers: {
          Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        },
      },
      6000,
    );
    if (res.ok) {
      const xml = await res.text();
      const doc = parser.parse(xml);
      const items = extractItems(doc);
      for (let i = 0; i < items.length && candidates.length < 25; i++) {
        const story = normalizeItem(items[i], feed, i);
        if (story) candidates.push(story);
      }
    } else {
      directError = new Error(`HTTP ${res.status}`);
    }
  } catch (e) {
    directError = e;
  }

  // 2. If direct/CORS XML fetch failed or produced no candidates, try rss2json converter
  if (!candidates.length) {
    try {
      candidates = await fetchRss2Json(feed);
    } catch {
      // Both failed
    }
  }

  if (!candidates.length) {
    throw directError || new Error('Could not fetch or parse feed');
  }

  const limit = feed.limit ?? 5;
  const out: RssStory[] = [];

  if (opts.todayOnly && opts.editionDate) {
    for (const story of candidates) {
      if (out.length >= limit) break;
      if (isSameChicagoDay(story.publishedAt, opts.editionDate)) {
        out.push(story);
      }
    }
  }

  // If todayOnly is false, or if todayOnly produced 0 items, take the latest candidate stories
  if (!out.length) {
    out.push(...candidates.slice(0, limit));
  }

  return out;
}

export interface CustomFeedResult {
  id: string;
  name: string;
  url: string;
  stories: RssStory[];
}

export interface FetchedSections {
  lead: RssStory[];
  alsoToday: RssStory[];
  news: RssStory[];
  businessTech: RssStory[];
  sports: RssStory[];
  customFeeds: CustomFeedResult[];
  okFeeds: string[];
  failedFeeds: { id: string; error: string }[];
}

function dedupe(stories: RssStory[]): RssStory[] {
  const seen = new Set<string>();
  const out: RssStory[] = [];
  for (const s of stories) {
    const key = s.url || s.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export interface FetchFeedsOptions {
  /** null/undefined = all built-ins; [] = none; non-empty = those ids. */
  enabledFeedIds?: string[] | null;
  /** Extra custom feeds (only ones with enabled !== false are fetched). */
  customFeeds?: { id: string; name: string; url: string; enabled?: boolean }[];
  /** When true, keep only items published on editionDate (America/Chicago). */
  todayOnlyBuiltIn?: boolean;
  editionDate?: string;
}

/** Fetch configured feeds; never throws. */
export async function fetchAllFeeds(opts: FetchFeedsOptions = {}): Promise<FetchedSections> {
  const empty: FetchedSections = {
    lead: [],
    alsoToday: [],
    news: [],
    businessTech: [],
    sports: [],
    customFeeds: [],
    feeds: [],
    okFeeds: [],
    failedFeeds: [],
  };

  // null/undefined → all built-ins.
  // [] → no built-ins (custom-only / RSS master off).
  // Non-empty → those ids only.
  // (Previously `opts.enabledFeedIds ? new Set(...)` treated [] as truthy,
  //  yielding an empty Set and filtering NEWS_FEEDS to zero feeds.)
  const enabled =
    opts.enabledFeedIds == null
      ? null
      : new Set(opts.enabledFeedIds);

  const builtIns = NEWS_FEEDS.filter((f) => !enabled || enabled.has(f.id));
  const customMap = new Map<string, CustomFeedResult>();
  (opts.customFeeds || []).forEach((c) => {
    if (c.enabled === false) return;
    customMap.set(c.id, { id: c.id, name: c.name || 'Custom', url: c.url, stories: [] });
  });

  const customs: FeedConfig[] = (opts.customFeeds || [])
    .filter((c) => c.enabled !== false)
    .map((c) => ({
    id: c.id,
    name: c.name || 'Custom',
    url: c.url,
    section: 'news',
    limit: 10,
  }));

  const editionDate = opts.editionDate;
  const jobs: { feed: FeedConfig; todayOnly: boolean }[] = [
    ...builtIns.map((feed) => ({
      feed,
      todayOnly: Boolean(opts.todayOnlyBuiltIn && editionDate),
    })),
    ...customs.map((feed) => ({
      feed,
      todayOnly: false,
    })),
  ];

  const results = await Promise.all(
    jobs.map(async ({ feed, todayOnly }) => {
      try {
        const stories = await fetchFeed(feed, {
          todayOnly,
          editionDate: editionDate,
        });
        return { feed, stories, error: null as string | null };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { feed, stories: [] as RssStory[], error: msg };
      }
    }),
  );

  const feedResults: FeedResult[] = [];

  for (const r of results) {
    if (r.error) {
      empty.failedFeeds.push({ id: r.feed.id, error: r.error });
      continue;
    }
    empty.okFeeds.push(r.feed.id);
    const dedupedStories = dedupe(r.stories);
    if (dedupedStories.length > 0) {
      feedResults.push({
        id: r.feed.id,
        name: r.feed.name,
        section: r.feed.section,
        url: r.feed.url,
        stories: dedupedStories,
      });
    }
    if (customMap.has(r.feed.id)) {
      const entry = customMap.get(r.feed.id)!;
      entry.stories = dedupedStories;
    } else {
      empty[r.feed.section].push(...r.stories);
    }
  }

  feedResults.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  empty.feeds = feedResults;
  empty.customFeeds = Array.from(customMap.values());

  empty.lead = dedupe(empty.lead);
  empty.alsoToday = dedupe(empty.alsoToday);
  empty.news = dedupe(empty.news);
  empty.businessTech = dedupe(empty.businessTech);
  empty.sports = dedupe(empty.sports);

  return empty;
}
