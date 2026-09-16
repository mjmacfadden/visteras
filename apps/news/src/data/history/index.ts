import type { HistoryItem } from '../types';
import { dateKey } from '../dayIndex';

import { januaryHistory } from './january';
import { februaryHistory } from './february';
import { marchHistory } from './march';
import { aprilHistory } from './april';
import { mayHistory } from './may';
import { juneHistory } from './june';
import { julyHistory } from './july';
import { augustHistory } from './august';
import { septemberHistory } from './september';
import { octoberHistory } from './october';
import { novemberHistory } from './november';
import { decemberHistory } from './december';

export const allHistory: Record<string, HistoryItem[]> = {
  ...januaryHistory,
  ...februaryHistory,
  ...marchHistory,
  ...aprilHistory,
  ...mayHistory,
  ...juneHistory,
  ...julyHistory,
  ...augustHistory,
  ...septemberHistory,
  ...octoberHistory,
  ...novemberHistory,
  ...decemberHistory,
};

export const fallbackHistory: HistoryItem[] = [
  { year: 1969, text: 'Apollo program continues to redefine what nations can do together in space.' },
];

export function getHistoryForDate(date: Date | string = new Date()): HistoryItem[] {
  let key: string;
  if (typeof date === 'string') {
    if (date.length === 5 && date.includes('-')) key = date;
    else {
      const parts = date.split('-');
      if (parts.length >= 3) key = `${parts[1].padStart(2, '0')}-${parts[2].slice(0, 2).padStart(2, '0')}`;
      else key = dateKey(new Date(date));
    }
  } else key = dateKey(date);
  return allHistory[key] || fallbackHistory;
}
