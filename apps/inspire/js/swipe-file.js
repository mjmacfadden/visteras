/**
 * Visteras Inspire — Swipe File & Inspiration Library
 * Auto-categorization, reusable tags & taxonomy, search, and quick capture.
 */

import { extractPaletteFromImage, hexToRgb, getNearestColorName } from './color-extractor.js';

export const TAXONOMY_CATEGORIES = [
  'All',
  'Photos',
  'Quotes',
  'Written Copy',
  'Logos & Graphics',
  'Color Palettes',
  'Sticky Notes'
];

export const COMMON_MOOD_TAGS = [
  'minimal', 'editorial', 'vintage', 'retro', 'modern', 'architecture',
  'nature', 'typography', 'branding', 'dark', 'warm', 'pastel', 'bold',
  'industrial', 'fashion', 'textures', 'cozy', 'geometric', 'organic'
];

export class SwipeFileManager {
  constructor(initialData = null) {
    this.items = [];
    this.tags = new Set(COMMON_MOOD_TAGS);
    this.categories = [...TAXONOMY_CATEGORIES];
    this.listeners = new Set();

    if (initialData) {
      this.loadData(initialData);
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this);
      } catch (err) {
        console.error('[SwipeFileManager] listener error', err);
      }
    }
  }

  loadData(data) {
    if (!data) return;
    this.items = Array.isArray(data.items) ? [...data.items] : [];
    if (Array.isArray(data.tags)) {
      for (const t of data.tags) this.tags.add(t.toLowerCase().trim());
    }
    if (Array.isArray(data.categories)) {
      this.categories = [...new Set([...TAXONOMY_CATEGORIES, ...data.categories])];
    }
    this.notify();
  }

  toJSON() {
    return {
      items: this.items,
      tags: Array.from(this.tags),
      categories: this.categories
    };
  }

  /**
   * Auto-Categorize text input into Quotes, Headlines, Written Copy, or Color Palettes
   */
  categorizeText(rawText) {
    const text = rawText.trim();
    if (!text) return { category: 'Written Copy', title: 'Untitled Note', type: 'text' };

    // 1. Color Palette check: matches hex codes or rgb/hsl
    const hexPattern = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
    const hexMatches = text.match(hexPattern);
    if (hexMatches && hexMatches.length > 0 && text.length < 150) {
      return {
        category: 'Color Palettes',
        title: hexMatches.length === 1 ? `Swatch ${hexMatches[0]}` : `Palette (${hexMatches.length} tones)`,
        type: 'color',
        colors: hexMatches
      };
    }

    // 2. Quote check: quotation marks or author attribution
    const hasQuotes = /^["“'«](.+)["”'»]/.test(text) || (text.includes('"') || text.includes('“') || text.includes('”'));
    const hasAuthor = /\s*[—–-]\s*[A-Z]/.test(text) || text.includes('by ') || text.includes('—');
    const isShortPunchy = text.length <= 280;

    if (hasQuotes || (hasAuthor && isShortPunchy)) {
      // Try to parse quote & author
      let quote = text;
      let author = '';
      if (text.includes('—')) {
        const parts = text.split('—');
        quote = parts[0].trim().replace(/^["“]|["”]$/g, '');
        author = parts.slice(1).join('—').trim();
      } else if (text.includes('--')) {
        const parts = text.split('--');
        quote = parts[0].trim().replace(/^["“]|["”]$/g, '');
        author = parts.slice(1).join('--').trim();
      } else {
        quote = text.replace(/^["“]|["”]$/g, '');
      }

      return {
        category: 'Quotes',
        title: quote.slice(0, 36) + (quote.length > 36 ? '...' : ''),
        type: 'quote',
        quote,
        author: author || 'Unknown'
      };
    }

    // 3. Headline check: very brief, uppercase or title case, < 60 chars
    if (text.length <= 60 && !text.includes('\n')) {
      return {
        category: 'Written Copy',
        title: text,
        type: 'text'
      };
    }

    // 4. Default: Written Copy
    const firstLine = text.split('\n')[0].trim().slice(0, 40);
    return {
      category: 'Written Copy',
      title: firstLine + (text.length > 40 ? '...' : ''),
      type: 'text'
    };
  }

  /**
   * Auto-Categorize image input based on dimension, transparency, and aspect ratio
   */
  async categorizeImage(dataUrl, fileName = '') {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = async () => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const aspect = w / (h || 1);

        // Check transparency by sampling pixels
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(100, w);
        canvas.height = Math.min(100, h);
        const ctx = canvas.getContext('2d');
        let isTransparent = false;

        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let transparentCount = 0;
          for (let i = 3; i < data.length; i += 4) {
            if (data[i] < 200) transparentCount++;
          }
          if (transparentCount / (data.length / 4) > 0.12) {
            isTransparent = true;
          }
        }

        // Dominant color palette extraction
        let colors = [];
        try {
          const pal = await extractPaletteFromImage(img, 4);
          colors = pal.map(p => p.hex);
        } catch (_) {}

        let category = 'Photos';
        let suggestedTags = [];

        if (isTransparent || (fileName && (fileName.includes('logo') || fileName.includes('icon') || fileName.endsWith('.svg')))) {
          category = 'Logos & Graphics';
          suggestedTags.push('graphic', 'logo');
        } else if (aspect > 2.2 || aspect < 0.45) {
          category = 'Photos';
          suggestedTags.push('banner', 'landscape');
        } else {
          category = 'Photos';
          suggestedTags.push('photography');
        }

        // Generate tags from dominant colors
        for (const col of colors.slice(0, 2)) {
          suggestedTags.push(getNearestColorName(col).toLowerCase().replace(/\s+/g, '-'));
        }

        const title = fileName ? fileName.replace(/\.[^/.]+$/, '') : `Inspiration Image (${w}×${h})`;

        resolve({
          category,
          title,
          type: 'image',
          width: w,
          height: h,
          colors,
          tags: suggestedTags
        });
      };
      img.onerror = () => {
        resolve({
          category: 'Photos',
          title: fileName || 'Inspiration Image',
          type: 'image',
          colors: [],
          tags: ['image']
        });
      };
      img.src = dataUrl;
    });
  }

  /**
   * Automatically generate mood tags from text keywords
   */
  suggestTagsFromText(text) {
    const lower = text.toLowerCase();
    const found = [];
    const keywords = [
      'minimal', 'editorial', 'vintage', 'retro', 'modern', 'architecture',
      'nature', 'typography', 'branding', 'dark', 'warm', 'pastel', 'bold',
      'industrial', 'fashion', 'texture', 'cozy', 'geometric', 'organic',
      'design', 'creative', 'art', 'light', 'clean', 'graphic', 'aesthetic'
    ];
    for (const kw of keywords) {
      if (lower.includes(kw)) found.push(kw);
    }
    return found;
  }

  /**
   * Capture an item into the library
   */
  async addItem({ type, content, title, category, tags = [], colors = [], source = 'manual', meta = {} }) {
    let finalCat = category;
    let finalTitle = title;
    let finalType = type;
    let finalColors = [...colors];
    let finalTags = [...tags];

    if (type === 'text' && (!category || category === 'All')) {
      const auto = this.categorizeText(content);
      finalCat = auto.category;
      finalTitle = title || auto.title;
      finalType = auto.type;
      if (auto.colors) finalColors.push(...auto.colors);
      if (auto.quote) meta.quote = auto.quote;
      if (auto.author) meta.author = auto.author;

      const autoTags = this.suggestTagsFromText(content);
      finalTags.push(...autoTags);
    } else if (type === 'image' && (!category || category === 'All')) {
      const auto = await this.categorizeImage(content, title);
      finalCat = auto.category;
      finalTitle = title || auto.title;
      finalType = auto.type;
      if (auto.colors) finalColors.push(...auto.colors);
      if (auto.tags) finalTags.push(...auto.tags);
      meta.width = auto.width;
      meta.height = auto.height;
    }

    // Register any new tags
    for (const t of finalTags) {
      this.tags.add(t.toLowerCase().trim());
    }

    const item = {
      id: 'swipe_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      type: finalType || 'text',
      category: finalCat || 'Written Copy',
      title: finalTitle || 'Untitled Swipe Item',
      content,
      tags: Array.from(new Set(finalTags.map(t => t.toLowerCase().trim()))),
      colors: Array.from(new Set(finalColors)),
      source,
      addedAt: new Date().toISOString(),
      meta
    };

    this.items.unshift(item);
    this.notify();
    return item;
  }

  removeItem(id) {
    const idx = this.items.findIndex(it => it.id === id);
    if (idx >= 0) {
      this.items.splice(idx, 1);
      this.notify();
      return true;
    }
    return false;
  }

  updateItem(id, updates) {
    const item = this.items.find(it => it.id === id);
    if (!item) return null;
    Object.assign(item, updates);
    if (updates.tags) {
      for (const t of updates.tags) this.tags.add(t.toLowerCase().trim());
    }
    this.notify();
    return item;
  }

  addTag(tag) {
    const clean = tag.toLowerCase().trim().replace(/^#/, '');
    if (clean) {
      this.tags.add(clean);
      this.notify();
    }
  }

  addTagToItem(id, tag) {
    const item = this.items.find(it => it.id === id);
    if (!item) return null;
    const clean = (tag || '').toLowerCase().trim().replace(/^#/, '');
    if (!clean) return item;
    if (!item.tags) item.tags = [];
    if (!item.tags.includes(clean)) {
      item.tags.push(clean);
      this.tags.add(clean);
      this.notify();
    }
    return item;
  }

  removeTagFromItem(id, tag) {
    const item = this.items.find(it => it.id === id);
    if (!item || !item.tags) return null;
    const clean = (tag || '').toLowerCase().trim().replace(/^#/, '');
    const idx = item.tags.indexOf(clean);
    if (idx >= 0) {
      item.tags.splice(idx, 1);
      this.notify();
    }
    return item;
  }

  getFilteredItems({ query = '', category = 'All', tag = null, color = null } = {}) {
    return this.items.filter(item => {
      // Category filter
      if (category && category !== 'All' && item.category !== category) {
        return false;
      }
      // Tag filter
      if (tag && !item.tags.includes(tag.toLowerCase().trim())) {
        return false;
      }
      // Color filter
      if (color && (!item.colors || !item.colors.includes(color))) {
        return false;
      }
      // Query filter
      if (query && query.trim()) {
        const q = query.toLowerCase().trim();
        const inTitle = item.title?.toLowerCase().includes(q);
        const inContent = typeof item.content === 'string' && item.content.toLowerCase().includes(q);
        const inTags = item.tags?.some(t => t.toLowerCase().includes(q));
        const inAuthor = item.meta?.author?.toLowerCase().includes(q);
        if (!inTitle && !inContent && !inTags && !inAuthor) {
          return false;
        }
      }
      return true;
    });
  }
}
