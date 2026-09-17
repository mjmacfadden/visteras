/**
 * Thin print/preview wrappers for THE DAILY MIKE.
 *
 * Letter pagination lives in pageSheets.ts (shared digital + print DOM).
 * Vivliostyle is no longer on the critical path.
 */

import { scrollToPageSheet } from './pageSheets';

export type VivlioPrintOptions = {
  title?: string;
  preview?: boolean;
};

/** Print the visible `.page-sheet` stack via the browser. */
export async function printEdition(_editionEl?: HTMLElement, _title = 'The Daily Mike') {
  window.print();
}

/** Preview = scroll to the paged letter sheets (already the reading view). */
export async function previewEdition(_editionEl?: HTMLElement, _title = 'The Daily Mike') {
  scrollToPageSheet(1);
}

export async function printWithVivliostyle(
  _editionEl: HTMLElement,
  options: VivlioPrintOptions = {},
): Promise<void> {
  if (options.preview) return previewEdition();
  return printEdition();
}
