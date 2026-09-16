# Royko — THE DAILY MIKE

Personal morning newspaper for Northbrook, IL. **Not a news dashboard** — the site *is* the newspaper: cream paper, black ink, serif type, thin rules, three finite pages, designed for **print first** (letter 8.5×11).

**Masthead:** THE DAILY MIKE (Manufacturing Consent + Playfair for headlines)  
**Tagline:** Independent · Personal · Daily  
**Location context:** Northbrook / ZIP 60062 (weather & dateline — not the paper’s name)  
**Weather:** [weatherwidget.io](https://weatherwidget.io) on screen (black/grayscale, transparent); **print** uses a B&W Open-Meteo multi-day strip (hi/lo + condition text) — iframes are never relied on for ink. Grok weather prose still prints when present.  
**Sample edition:** Wednesday, September 9, 2026 · Vol. I, No. 214

## Quick start

```bash
cd /path/to/Royko
cp .env.example .env   # optional — sets PUBLIC_SITE_URL for QR codes
npm install
npm run dev
```

Open **http://localhost:4321/**  
Print: **Print edition** (or ⌘/Ctrl+P) prints the on-screen letter page sheets. Screen chrome & settings are hidden when printing.

```bash
npm run build    # Static build → dist/
npm run preview  # preview production build
npm start        # preview production build (astro preview)
```

### Environment

| Variable | Purpose |
|----------|---------|
| `PUBLIC_SITE_URL` | Absolute origin for puzzle-answer QR codes (e.g. `https://daily-mike.example.com`). Defaults to `window.location.origin` or `http://localhost:4321`. |

QR / answers URL pattern: **`{PUBLIC_SITE_URL}/answers?date=YYYY-MM-DD`**  
Example: `http://localhost:4321/answers?date=2026-09-09`

## What’s in this phase

| Area | Status |
|------|--------|
| Astro app + 3-page newspaper shell | ✅ 100% Client-Side |
| Print-first continuous flow + **Vivliostyle** letter pagination (`@vivliostyle/print`, root 3-col) | ✅ |
| Masthead one-line on screen + print (Manufacturing Consent) | ✅ |
| Merriweather body ~10pt print / tight screen | ✅ |
| Puzzle answers dynamic page + QR (`/answers?date=...`) | ✅ dynamic parameter |
| weatherwidget.io screen + Open-Meteo B&W print strip | ✅ |
| Live RSS ingestion (optional; **off by default**) | ✅ client-side |
| Settings panel (feeds, ZIP, comics, calendars, Grok brief) | ✅ localStorage |
| Comics RSS (xkcd + SMBC + The Oatmeal) | ✅ client-side |
| Public ICS / Google embed → agenda (multi-calendar merge) | ✅ client-side |
| Grok Automation paste = news backbone (RSS optional) | ✅ |
| Page 3 games band + horizontal comics | ✅ |
| Google Calendar OAuth | ❌ Not needed — use public ICS |
| Auth / Supabase | ❌ Out of scope |

### Settings (screen only)

Open **Settings** in the top chrome (or **Paste brief** for a quick Grok paste):

1. **Grok Automation brief** — **required news backbone**; paste markdown to fill lead / news / local / sports / markets.
2. **Public calendar ICS / Google embed URLs** — paste embed (`/calendar/embed?src=…`), public iCal, or raw `.ics`; embed→ICS is automatic. Calendar must be public. Today’s events (America/Chicago) merge into the agenda.
3. **Comics** — opt into/out of xkcd, SMBC, The Oatmeal (features band after news flow).
4. **ZIP code** — default `60062` (Northbrook). The screen weather widget is currently the fixed Northbrook [weatherwidget.io / forecast7](https://forecast7.com/en/42d13n87d83/northbrook/) embed; settings ZIP may drive a different forecast7 URL later.
5. **Built-in / custom RSS** — **disabled by default**. Opt in via “Enable RSS news” if you want wires mixed with the brief.

When no Grok paste is saved, columns show: **“Paste today’s Grok brief to fill the paper.”**

Prefs persist in `localStorage` (`daily-mike-settings-v1`). Grok paste: `daily-mike-grok-brief-v1`.

### Grok Automation brief

Paste the morning Automation output. Parser: `src/lib/grokBrief.ts` · sample: `src/data/samples/grok-brief-example.md` (also `/samples/grok-brief-example.md`).

#### Paste format (canonical — what Grok emits now)

```
***Weather — Northbrook, Illinois***
Prose paragraphs (no headlines required).
Source: National Weather Service…

***National & World***

**Headline here**
*Named source: Reuters, September 9*
****https://pbs.twimg.com/amplify_video_thumb/2097497733732909056/img/pDq6ih9vJoy0SjBi.jpg****
Story body paragraph(s) in plain text.

**Another headline**
*Named source: Associated Press, September 9*
More body…

***United States / Illinois / Chicago***
**Headline**
*Named source: …*
body

***Sports***
**Headline**
*Named source: …*
body

***Markets***
Prose only (becomes one Brief card in Business · Tech).

***What to watch today***
- bullet one
- bullet two

Compiled 8:42 a.m. CT from 34 sources.
```

Optional masthead lines (`**The Daily Mike**`, date, timezone, lede) may appear *before* the first `***Section***` — both with and without are fine.

**Rules**

1. `***Section Name***` alone on a line = **section** when it matches known kinds/titles (Weather, National & World, United States / Illinois / Chicago, Sports, Markets, What to watch today) or looks like a section (`—`, `/`, keywords). Otherwise `***…***` is still treated as a legacy headline.
2. `**Headline**` alone on a line = story headline.
3. `*Named source: Outlet, Date*` (italic single asterisks) = byline/source. Plain `Named source:` / `Source:` and legacy `**byline**` still work.
4. Plain paragraphs = story body until the next headline or section. Weather + Markets are prose under the section; What to watch uses `-` bullets.
5. Images (optional): alone on a line under a story (or before the next story), use quadruple asterisks — `****https://image-url.jpg****`. Automation may also emit a duplicate URL in parentheses: `****https://…jpg (https://…jpg//)****`. The primary URL is attached as `imageUrl` on the story; the raw `****…****` line is stripped from body text. Rendered images fit the column (`max-width: 100%`, constrained height).
6. Alternates still accepted: `## Section` headers, and older `***Headline***` + `**byline**` dialect.

**How it maps onto the paper**

| Brief section | Placement |
|---------------|-----------|
| Weather prose | Under the weatherwidget strip on screen; also fills the **print** weather fallback |
| National & World | **News** (first item can lead page 1) |
| Illinois / Chicago / Local | **Also today · Local** |
| Sports | **Sports** |
| Markets | **Business · Tech · Markets** |
| What to watch | Tight list under agenda |
| Lede | Roundup box on page 1 |

Grok items show **Brief** (plus named source when present). Optional RSS (when enabled) can interleave with Brief cards.

### Public calendars (ICS)

No OAuth. Direct client fetch parses `VEVENT` (with CORS fallback), keeps events whose start falls on **today in America/Chicago**, merges all calendars, sorts by start ascending.

**Google Calendar → public ICS / secret address**

1. Open [Google Calendar](https://calendar.google.com) on the web.
2. Settings (gear) → select the calendar under **Settings for my calendars**.
3. Scroll to **Integrate calendar**.
4. Copy **Secret address in iCal format** (private-but-URL) *or* make the calendar public and use **Public address in iCal format**.
5. Paste that `https://calendar.google.com/calendar/ical/…/basic.ics` URL into Settings → Public calendars.
6. Optional label (e.g. “Family”) — shown on agenda rows when more than one calendar is configured.

Any other `.ics` URL works the same way. Empty/failed fetches fall back to the placeholder agenda.

### News / RSS (optional)

**Default: RSS off.** The edition’s stories come from the parsed Grok Automation paste. Feed catalog and client-side RSS parser remain for optional re-enable in Settings.

Feed catalog: `src/data/feeds.ts`

Starter feeds (skipped gracefully on failure when enabled):

- NPR News, NPR briefs  
- BBC World, BBC Business  
- NYT Home, NYT U.S.  
- Ars Technica, The Verge, Hacker News  
- ESPN  

Normalize → `RssStory` (`src/data/types.ts`). Headlines + short excerpts + source link only — **no full-article republish**.

`src/lib/edition.ts` skips news RSS by default (comics still fetch). Pass `rssEnabled: true` / Settings opt-in to merge wires.

### Puzzle answers + QR

- Paper puzzles **do not** reveal answers.
- Answers: `/answers?date=YYYY-MM-DD` (phone-friendly, rendered dynamically on client).
- QR on puzzles page → dynamic answers URL with date parameter.

### Comics

Config: `src/data/feeds/comics.ts`  
Pipeline: `src/lib/comics.ts` — RSS 2.0 / Atom / **RSS 1.0 RDF** (Oatmeal); hotlink + credit; link out (do not re-host). Graceful fallback if empty/fails.

Default strips: **xkcd**, **SMBC**, **The Oatmeal** (capped at 3 for print).

### Typography

- **Masthead:** [Manufacturing Consent](https://fonts.google.com/specimen/Manufacturing+Consent)
- **Headlines:** Playfair Display  
- **Body:** Merriweather ≈ **10pt** print, tight leading  
- **UI/small caps:** Libre Franklin  

## Project layout

```
src/
  components/     Masthead, SettingsPanel, AnswersQr, puzzles, ComicStrip…
  data/
    feeds.ts              curated news RSS list
    feeds/comics.ts       comic RSS slots
    samples/grok-brief-example.md
    types.ts
    edition-2026-09-09.ts placeholders / agenda / weather
    editions/latest.ts
    puzzles/              jumble · trivia · crossword banks
  lib/
    site.ts               PAPER_NAME, PUBLIC_SITE_URL, answers URLs
    rss.ts                fetch/normalize
    comics.ts
    calendar.ts           public ICS parse + merge
    grokBrief.ts          Grok Automation paste parser + interleave helpers
    edition.ts            merge live → Edition
    settings.ts           localStorage settings + Grok store
    dateFilter.ts         America/Chicago today filter
    vivlioPrint.ts        Vivliostyle printHTML + print-doc builder (client)
  pages/
    index.astro
    answers/[date].astro
    api/rss.ts            POST settings-driven fetch
    api/calendar.ts       POST multi-ICS → today’s agenda
  styles/
    newspaper.css         screen / live editor (legacy @media print kept as fallback)
    vivliostyle-print.css print HTML only — letter + root 3-col for Vivliostyle
public/samples/           served sample brief for Settings “Load sample”
```

## Print (Vivliostyle)

Print is more important than screen. The live editor keeps the cream-paper UX; **Print edition** / ⌘P uses [Vivliostyle](https://vivliostyle.org/) (`@vivliostyle/print` → `printHTML`) so pagination is real CSS paged media, not browser `@media print` columns.

**How it works**

1. Client clones the composed `.edition-document` (post–Grok paste: weather B&W strip, agenda, stories, games, comics).
2. Strips screen-only UI (settings, paste panel, weather iframe, nav chrome).
3. Wraps it in a minimal HTML document with Google Fonts (Merriweather / Manufacturing Consent / Playfair / Libre Franklin) and `src/styles/vivliostyle-print.css`.
4. **Root multicol:** `html { column-count: 3; … }` — Vivliostyle’s own root-multicol engine packs columns across letter pages (`@page { size: letter; margin: ~0.4in; }`). Masthead / weather / front pack / features use page floats so they span the page width.
5. `printHTML(htmlDoc, { title: 'The Daily Mike' })` paginates in a hidden iframe, then opens the browser print dialog (live DOM untouched).
6. The digital view is already paginated letter sheets — same sheets Print edition uses.

Module: `src/lib/vivlioPrint.ts` (dynamic `import('@vivliostyle/print')` — client-only).

Legacy `newspaper.css` `@media print` remains as a non-Vivliostyle fallback if something bypasses the Print button; primary path is Vivliostyle.

### Verify Print

1. `npm run dev` → http://localhost:4321/
2. Paste a Grok brief so the edition is composed.
3. Confirm on-screen letter pages: 3-col story flow, B&W print weather strip, dense packing.
4. Click **Print edition** (or ⌘/Ctrl+P) — system print dialog should show the same Vivliostyle pages.
5. `npm run build` must succeed.

## License / personal use

Built for Mike Macfadden (Northbrook, America/Chicago). Family-facing morning paper.

### AGPL note — Vivliostyle

`@vivliostyle/print` is licensed under **AGPL-3.0**. Personal / family use of THE DAILY MIKE is fine. If you distribute a modified version of this app (or host it as a network service that others use) in a way that triggers AGPL obligations, you must disclose that Vivliostyle is AGPL and comply with its terms (typically: offer corresponding source for the AGPL-covered parts). See [Vivliostyle license FAQ](https://vivliostyle.org/faq/#vivliostyle-license-faq). The rest of this personal newspaper project is not dual-licensed with Vivliostyle — we only consume the `printHTML` entry point.
