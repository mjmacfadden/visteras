/**
 * Converts rich text / clipboard HTML into Markdown suitable for the Grok brief parser.
 * Handles headings, paragraphs, lists, bold/italic, links, and images (with data-src/srcset detection).
 */

function cleanWhitespace(s: string): string {
  return s.replace(/[\t ]+/g, ' ');
}

function extractImageSrc(el: HTMLElement): string {
  const src =
    el.getAttribute('src') ||
    el.getAttribute('data-src') ||
    el.getAttribute('data-original-src') ||
    el.getAttribute('data-url') ||
    el.getAttribute('data-full-url') ||
    '';

  if (src && !src.startsWith('data:image/svg+xml') && !src.startsWith('data:image/gif')) {
    return src.trim();
  }

  // Check srcset if available
  const srcset = el.getAttribute('srcset') || el.getAttribute('data-srcset');
  if (srcset) {
    const candidates = srcset.split(',').map((c) => c.trim().split(/\s+/));
    const last = candidates[candidates.length - 1];
    if (last && last[0] && !last[0].startsWith('data:')) {
      return last[0].trim();
    }
  }

  return src.trim();
}

function elementToMarkdown(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();

  // Ignored / hidden tags
  if (
    tag === 'script' ||
    tag === 'style' ||
    tag === 'noscript' ||
    tag === 'svg' ||
    tag === 'meta' ||
    tag === 'link'
  ) {
    return '';
  }

  // Images
  if (tag === 'img') {
    const src = extractImageSrc(el);
    if (!src) return '';
    const alt = (el.getAttribute('alt') || el.getAttribute('title') || '').replace(/[\[\]]/g, '').trim();
    return `\n\n![${alt}](${src})\n\n`;
  }

  // Line breaks
  if (tag === 'br') {
    return '\n';
  }

  // Horizontal rules
  if (tag === 'hr') {
    return '\n\n---\n\n';
  }

  const childMd = childrenToMarkdown(el);

  // Headings
  if (tag === 'h1' || tag === 'h2') {
    const t = childMd.trim();
    return t ? `\n\n## ${t}\n\n` : '';
  }
  if (tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
    const t = childMd.trim();
    return t ? `\n\n**${t}**\n\n` : '';
  }

  // Paragraphs
  if (tag === 'p') {
    const t = childMd.trim();
    return t ? `\n\n${t}\n\n` : '';
  }

  // Blockquotes
  if (tag === 'blockquote') {
    const t = childMd.trim();
    if (!t) return '';
    const lines = t.split('\n');
    return `\n\n${lines.map((l) => `> ${l}`).join('\n')}\n\n`;
  }

  // Lists
  if (tag === 'ul' || tag === 'ol') {
    const t = childMd.trim();
    return t ? `\n\n${t}\n\n` : '';
  }

  if (tag === 'li') {
    const t = childMd.trim();
    if (!t) return '';
    return `- ${t}\n`;
  }

  // Bolding
  if (tag === 'strong' || tag === 'b') {
    const t = childMd.trim();
    if (!t) return childMd;
    const lead = childMd.match(/^\s*/)?.[0] || '';
    const trail = childMd.match(/\s*$/)?.[0] || '';
    return `${lead}**${t}**${trail}`;
  }

  // Italics
  if (tag === 'em' || tag === 'i') {
    const t = childMd.trim();
    if (!t) return childMd;
    const lead = childMd.match(/^\s*/)?.[0] || '';
    const trail = childMd.match(/\s*$/)?.[0] || '';
    return `${lead}*${t}*${trail}`;
  }

  // Strikethrough
  if (tag === 'del' || tag === 's' || tag === 'strike') {
    const t = childMd.trim();
    if (!t) return childMd;
    const lead = childMd.match(/^\s*/)?.[0] || '';
    const trail = childMd.match(/\s*$/)?.[0] || '';
    return `${lead}~~${t}~~${trail}`;
  }

  // Links
  if (tag === 'a') {
    const href = (el.getAttribute('href') || '').trim();
    const t = childMd.trim();
    if (!href || href.startsWith('javascript:')) return childMd;
    if (!t) return href;
    if (t === href) return href;
    const lead = childMd.match(/^\s*/)?.[0] || '';
    const trail = childMd.match(/\s*$/)?.[0] || '';
    return `${lead}[${t}](${href})${trail}`;
  }

  // Code blocks
  if (tag === 'pre') {
    return `\n\n\`\`\`\n${el.textContent || ''}\n\`\`\`\n\n`;
  }
  if (tag === 'code') {
    return `\`${el.textContent || ''}\``;
  }

  // Block containers
  if (
    tag === 'div' ||
    tag === 'section' ||
    tag === 'article' ||
    tag === 'main' ||
    tag === 'header' ||
    tag === 'footer' ||
    tag === 'aside' ||
    tag === 'figure'
  ) {
    return `\n${childMd}\n`;
  }

  return childMd;
}

function childrenToMarkdown(parent: Node): string {
  let res = '';
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (child.nodeType === 3) {
      // Text node
      res += cleanWhitespace(child.textContent || '');
    } else if (child.nodeType === 1) {
      // Element node
      res += elementToMarkdown(child as HTMLElement);
    }
  }
  return res;
}

/**
 * Fallback regex-based converter for environments where DOMParser is unavailable (e.g. minimal test runners).
 */
export function fallbackHtmlToMarkdown(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<img[^>]+src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi, '\n\n![$2]($1)\n\n')
    .replace(/<img[^>]+alt=["']([^"']*)["'][^>]*src=["']([^"']+)["'][^>]*>/gi, '\n\n![$1]($2)\n\n')
    .replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, '\n\n![]($1)\n\n')
    .replace(/<h[12][^>]*>(.*?)<\/h[12]>/gi, '\n\n## $1\n\n')
    .replace(/<h[3-6][^>]*>(.*?)<\/h[3-6]>/gi, '\n\n**$1**\n\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
    .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n\n$1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

/**
 * Converts clipboard / rich text HTML into clean Markdown with image URL and formatting support.
 */
export function htmlToMarkdown(html: string): string {
  if (!html || !html.trim()) return '';

  let rawMd = '';
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    rawMd = childrenToMarkdown(doc.body);
  } else {
    rawMd = fallbackHtmlToMarkdown(html);
  }

  return rawMd
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
