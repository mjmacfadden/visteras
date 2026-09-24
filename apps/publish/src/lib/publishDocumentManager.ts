/**
 * Visteras Publish — Document & Tab Manager
 *
 * Provides multi-document tabs following the Studio and Vector design UX,
 * along with JSON save/export and open/import for complete edition state
 * (paper title, tagline, weather ZIP, calendars, custom RSS feeds + article counts,
 * enabled built-in feeds, enabled comics, and Grok automation brief).
 */

import {
  defaultSettings,
  loadSettings,
  saveSettings,
  loadGrokBrief,
  saveGrokBrief,
  clearGrokBrief,
  normalizePaperSettings,
  type PaperSettings,
  type GrokBriefStore,
} from './settings';

export const PUBLISH_EDITION_SCHEMA = 'visteras-publish-edition-v1';
export const PUBLISH_APP_ID = 'visteras-publish';

export interface PublishDocument {
  id: string;
  title: string;
  settings: PaperSettings;
  grokBrief: GrokBriefStore | null;
  editionDate: string;
  isDirty: boolean;
}

export interface PublishEditionBundle {
  $schema?: string;
  version: number;
  app: string;
  exportedAt: string;
  document: {
    title: string;
    editionDate: string;
    settings: PaperSettings;
    grokBrief: GrokBriefStore | null;
  };
}

export class PublishDocumentManager {
  public documents: PublishDocument[] = [];
  public activeId: string | null = null;
  public autoTitleCount = 1;
  private tabContainer: HTMLElement | null = null;
  private onTabChangeCallback: ((doc: PublishDocument) => void) | null = null;

  constructor() {
    this.init();
  }

  private init() {
    const initialSettings = loadSettings();
    const initialBrief = loadGrokBrief();
    const todayStr = new Date().toISOString().split('T')[0];

    const initialTitle = initialSettings.paperName && initialSettings.paperName !== 'The Daily Mike'
      ? initialSettings.paperName
      : 'The Daily Mike';

    const firstDoc: PublishDocument = {
      id: `doc_${Date.now()}`,
      title: initialTitle,
      settings: initialSettings,
      grokBrief: initialBrief,
      editionDate: initialBrief?.date || todayStr,
      isDirty: false,
    };

    this.documents = [firstDoc];
    this.activeId = firstDoc.id;
    this.autoTitleCount = 2;
  }

  public setTabContainer(container: HTMLElement, onTabChange?: (doc: PublishDocument) => void) {
    this.tabContainer = container;
    if (onTabChange) {
      this.onTabChangeCallback = onTabChange;
    }
    this.renderTabs();
  }

  public getActiveDocument(): PublishDocument | null {
    if (!this.activeId) return this.documents[0] || null;
    return this.documents.find((d) => d.id === this.activeId) || this.documents[0] || null;
  }

  public getDocument(id: string): PublishDocument | null {
    return this.documents.find((d) => d.id === id) || null;
  }

  public createDocument(opts?: {
    title?: string;
    settings?: PaperSettings;
    grokBrief?: GrokBriefStore | null;
    editionDate?: string;
  }): PublishDocument {
    const todayStr = new Date().toISOString().split('T')[0];
    const title = opts?.title || `Edition-${this.autoTitleCount++}`;
    const settings = opts?.settings ? normalizePaperSettings(opts.settings) : defaultSettings();
    if (opts?.title && !opts?.settings) {
      settings.paperName = opts.title;
    }

    const newDoc: PublishDocument = {
      id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title,
      settings,
      grokBrief: opts?.grokBrief || null,
      editionDate: opts?.editionDate || todayStr,
      isDirty: false,
    };

    this.documents.push(newDoc);
    this.setActiveDocument(newDoc.id);
    return newDoc;
  }

  public setActiveDocument(id: string): boolean {
    const target = this.getDocument(id);
    if (!target) return false;

    this.activeId = id;
    this.syncActiveToLocalStorage();
    this.renderTabs();

    if (this.onTabChangeCallback) {
      this.onTabChangeCallback(target);
    }
    return true;
  }

  public updateActiveDocument(updates: Partial<PublishDocument>): void {
    const active = this.getActiveDocument();
    if (!active) return;

    if (updates.settings) {
      active.settings = normalizePaperSettings(updates.settings);
    }
    if (updates.title !== undefined) {
      active.title = updates.title;
    }
    if (updates.grokBrief !== undefined) {
      active.grokBrief = updates.grokBrief;
    }
    if (updates.editionDate !== undefined) {
      active.editionDate = updates.editionDate;
    }
    if (updates.isDirty !== undefined) {
      active.isDirty = updates.isDirty;
    }

    this.syncActiveToLocalStorage();
    this.renderTabs();
  }

  public closeDocument(id: string): void {
    const index = this.documents.findIndex((d) => d.id === id);
    if (index === -1) return;

    if (this.documents.length === 1) {
      // If closing the only tab, reset it to a clean new edition
      const doc = this.documents[0];
      doc.title = 'The Daily Mike';
      doc.settings = defaultSettings();
      doc.grokBrief = null;
      doc.editionDate = new Date().toISOString().split('T')[0];
      doc.isDirty = false;
      this.syncActiveToLocalStorage();
      this.renderTabs();
      if (this.onTabChangeCallback) {
        this.onTabChangeCallback(doc);
      }
      return;
    }

    this.documents.splice(index, 1);

    if (this.activeId === id) {
      const nextIndex = Math.min(index, this.documents.length - 1);
      const nextDoc = this.documents[nextIndex];
      this.setActiveDocument(nextDoc.id);
    } else {
      this.renderTabs();
    }
  }

  public syncActiveToLocalStorage(): void {
    const active = this.getActiveDocument();
    if (!active) return;
    saveSettings(active.settings);
    if (active.grokBrief) {
      saveGrokBrief(active.grokBrief.text, active.grokBrief.date);
    } else {
      clearGrokBrief();
    }
  }

  public exportEdition(doc?: PublishDocument): void {
    const target = doc || this.getActiveDocument();
    if (!target) return;

    const bundle: PublishEditionBundle = {
      $schema: PUBLISH_EDITION_SCHEMA,
      version: 1,
      app: PUBLISH_APP_ID,
      exportedAt: new Date().toISOString(),
      document: {
        title: target.title,
        editionDate: target.editionDate || new Date().toISOString().split('T')[0],
        settings: target.settings,
        grokBrief: target.grokBrief,
      },
    };

    const json = JSON.stringify(bundle, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const safeName = (target.settings.paperName || target.title || 'edition')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const dateStr = target.editionDate || new Date().toISOString().split('T')[0];
    const filename = `${safeName}-${dateStr}.publish.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    target.isDirty = false;
    this.renderTabs();
  }

  public importEditionFromText(rawJson: string): PublishDocument {
    const parsed = JSON.parse(rawJson) as Record<string, any>;
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid JSON format');
    }

    let title = 'Imported Edition';
    let editionDate = new Date().toISOString().split('T')[0];
    let settings: PaperSettings = defaultSettings();
    let grokBrief: GrokBriefStore | null = null;

    if (parsed.document && typeof parsed.document === 'object') {
      // Visteras Publish Edition Bundle
      title = parsed.document.title || title;
      editionDate = parsed.document.editionDate || editionDate;
      settings = normalizePaperSettings(parsed.document.settings);
      grokBrief = parsed.document.grokBrief || null;
    } else if (parsed.settings && typeof parsed.settings === 'object') {
      // Legacy settings backup bundle
      settings = normalizePaperSettings(parsed.settings);
      title = settings.paperName || title;
    } else if ('paperName' in parsed || 'zip' in parsed || 'calendars' in parsed) {
      // Raw PaperSettings
      settings = normalizePaperSettings(parsed as Partial<PaperSettings>);
      title = settings.paperName || title;
    } else {
      throw new Error('Unrecognized edition file format');
    }

    const active = this.getActiveDocument();
    if (active && (!active.grokBrief || !active.grokBrief.text) && !active.isDirty) {
      // Reuse clean active tab
      active.title = title;
      active.editionDate = editionDate;
      active.settings = settings;
      active.grokBrief = grokBrief;
      active.isDirty = false;
      this.syncActiveToLocalStorage();
      this.renderTabs();
      if (this.onTabChangeCallback) {
        this.onTabChangeCallback(active);
      }
      return active;
    }

    // Otherwise create a new tab for the imported edition
    return this.createDocument({
      title,
      editionDate,
      settings,
      grokBrief,
    });
  }

  public renderTabs(): void {
    if (!this.tabContainer) return;

    this.tabContainer.innerHTML = '';

    for (const doc of this.documents) {
      const isActive = doc.id === this.activeId;
      const tabEl = document.createElement('div');
      tabEl.className = `document_tab${isActive ? ' active' : ''}`;
      tabEl.dataset.docId = doc.id;
      tabEl.title = `${doc.title}${doc.editionDate ? ` (${doc.editionDate})` : ''}`;

      const titleEl = document.createElement('span');
      titleEl.className = 'tab_title';
      titleEl.textContent = doc.title;

      if (doc.isDirty) {
        const dirtyEl = document.createElement('span');
        dirtyEl.className = 'tab_dirty';
        dirtyEl.textContent = ' •';
        titleEl.appendChild(dirtyEl);
      }

      const closeEl = document.createElement('span');
      closeEl.className = 'tab_close';
      closeEl.textContent = '×';
      closeEl.title = 'Close Tab (⌘W)';
      closeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeDocument(doc.id);
      });

      tabEl.appendChild(titleEl);
      tabEl.appendChild(closeEl);

      tabEl.addEventListener('click', () => {
        if (doc.id !== this.activeId) {
          this.setActiveDocument(doc.id);
        }
      });

      this.tabContainer.appendChild(tabEl);
    }

    // New Tab Button (+)
    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'new_tab_btn';
    newBtn.title = 'New Edition (⌘N)';
    newBtn.textContent = '+';
    newBtn.addEventListener('click', () => {
      this.createDocument();
    });

    this.tabContainer.appendChild(newBtn);
  }
}
