import type { BirthdayItem } from '../types';
import { dateKey } from '../dayIndex';

import { januaryBirthdays } from './january';
import { februaryBirthdays } from './february';
import { marchBirthdays } from './march';
import { aprilBirthdays } from './april';
import { mayBirthdays } from './may';
import { juneBirthdays } from './june';
import { julyBirthdays } from './july';
import { augustBirthdays } from './august';
import { septemberBirthdays } from './september';
import { octoberBirthdays } from './october';
import { novemberBirthdays } from './november';
import { decemberBirthdays } from './december';

export const allBirthdays: Record<string, BirthdayItem[]> = {
  ...januaryBirthdays,
  ...februaryBirthdays,
  ...marchBirthdays,
  ...aprilBirthdays,
  ...mayBirthdays,
  ...juneBirthdays,
  ...julyBirthdays,
  ...augustBirthdays,
  ...septemberBirthdays,
  ...octoberBirthdays,
  ...novemberBirthdays,
  ...decemberBirthdays,
};

export const fallbackBirthdays: BirthdayItem[] = [
  { name: 'Albert Einstein', year: 1879, note: 'Theoretical physicist' },
  { name: 'Marie Curie', year: 1867, note: 'Physicist & chemist' },
  { name: 'Leonardo da Vinci', year: 1452, note: 'Polymath & painter' },
  { name: 'Wolfgang Amadeus Mozart', year: 1756, note: 'Composer' },
];

/**
 * Get celebrity and historical birthdays for a given date.
 * Accepts Date object, 'YYYY-MM-DD', or 'MM-DD'.
 */
export function getBirthdaysForDate(date: Date | string = new Date()): BirthdayItem[] {
  let key: string;
  if (typeof date === 'string') {
    if (date.length === 5 && date.includes('-')) {
      key = date;
    } else {
      const parts = date.split('-');
      if (parts.length >= 3) {
        key = `${parts[1].padStart(2, '0')}-${parts[2].slice(0, 2).padStart(2, '0')}`;
      } else {
        key = dateKey(new Date(date));
      }
    }
  } else {
    key = dateKey(date);
  }
  return allBirthdays[key] || fallbackBirthdays;
}
