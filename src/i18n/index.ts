import { FR } from './fr';

export type Lang = 'en' | 'ar' | 'fr';

// Latin digits everywhere (Algerian usage), locale-correct order, separators and plurals.
const LOCALES: Record<Lang, string> = {
  en: 'en-GB',
  ar: 'ar-DZ-u-nu-latn',
  fr: 'fr-DZ',
};

export const localeOf = (lang: string): string => LOCALES[lang as Lang] || LOCALES.en;

/** Returns the string for the active language. French falls back to the shared dictionary, then English. */
export function tr(lang: string, en: string, ar: string, fr?: string): string {
  if (lang === 'ar') return ar;
  if (lang === 'fr') return fr || FR[en] || en;
  return en;
}

export const makeT = (lang: string) => (en: string, ar: string, fr?: string) => tr(lang, en, ar, fr);

export function formatNumber(lang: string, value: number, options?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(localeOf(lang), options).format(value);
  } catch {
    return String(value);
  }
}

type Unit = 'hour' | 'day' | 'minute';
const UNIT_FALLBACK: Record<Unit, { en: [string, string]; fr: [string, string]; ar: string }> = {
  hour: { en: ['hour', 'hours'], fr: ['heure', 'heures'], ar: 'ساعة' },
  day: { en: ['day', 'days'], fr: ['jour', 'jours'], ar: 'يوم' },
  minute: { en: ['min', 'min'], fr: ['min', 'min'], ar: 'دقيقة' },
};

/** "0 ساعة" / "2 hours" / "3 jours" — number and unit in the right order for each language. */
export function formatUnit(lang: string, value: number, unit: Unit, display: 'long' | 'short' = 'long'): string {
  try {
    return new Intl.NumberFormat(localeOf(lang), { style: 'unit', unit, unitDisplay: display }).format(value);
  } catch {
    const f = UNIT_FALLBACK[unit];
    if (lang === 'ar') return `${value} ${f.ar}`;
    const pair = lang === 'fr' ? f.fr : f.en;
    return `${value} ${Math.abs(value) === 1 ? pair[0] : pair[1]}`;
  }
}

function toDate(input: Date | string | number): Date {
  if (input instanceof Date) return input;
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, d] = input.split('-').map(Number);
    return new Date(y, m - 1, d); // date-only values are local days, not UTC midnight
  }
  return new Date(input);
}

export function formatDate(
  lang: string,
  input: Date | string | number,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
): string {
  const d = toDate(input);
  if (isNaN(d.getTime())) return String(input);
  try {
    return new Intl.DateTimeFormat(localeOf(lang), options).format(d);
  } catch {
    return d.toDateString();
  }
}

export function formatTime(lang: string, input: Date | string | number): string {
  const d = toDate(input);
  if (isNaN(d.getTime())) return String(input);
  try {
    return new Intl.DateTimeFormat(localeOf(lang), { hour: '2-digit', minute: '2-digit' }).format(d);
  } catch {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

export function formatDateTime(
  lang: string,
  input: Date | string | number,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
): string {
  return formatDate(lang, input, options);
}

/** Formats a wall-clock value such as "14:30", "14:30:00" or "2:30 PM" for the active locale. */
export function formatClock(lang: string, value: string | null | undefined): string {
  if (!value) return '';
  const m = String(value).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!m) return String(value);
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const mer = m[3]?.toUpperCase();
  if (mer === 'PM' && h !== 12) h += 12;
  if (mer === 'AM' && h === 12) h = 0;
  return formatTime(lang, new Date(2000, 0, 1, h, min));
}
