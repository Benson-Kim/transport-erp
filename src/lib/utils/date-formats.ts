import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';
import { enUS, fr, es } from 'date-fns/locale';

const locales: Record<string, any> = {
  en: enUS,
  fr: fr,
  es: es,
};

const getLocale = (lang?: string) => locales[lang || 'en'] || enUS;

/**
 * Ensures a valid Date object. Handles ISO strings and Date objects.
 */
export const toDate = (date: string | Date | null | undefined): Date | null => {
  if (!date) return null;
  const parsed = typeof date === 'string' ? parseISO(date) : date;
  return isValid(parsed) ? parsed : null;
};

export const formatDate = {
  /** 'MMM d, yyyy' -> Jan 1, 2024 */
  short: (date: string | Date, lang?: string) => {
    const d = toDate(date);
    return d ? format(d, 'MMM d, yyyy', { locale: getLocale(lang) }) : '';
  },

  /** 'dd MMM yyyy' -> 01 Jan 2024 */
  compact: (date: string | Date, lang?: string) => {
    const d = toDate(date);
    return d ? format(d, 'dd MMM yyyy', { locale: getLocale(lang) }) : '';
  },

  /** 'dd MMM' -> 01 Jan */
  dayMonth: (date: string | Date, lang?: string) => {
    const d = toDate(date);
    return d ? format(d, 'dd MMM', { locale: getLocale(lang) }) : '';
  },

  /** 'EEEE, MMMM d, yyyy' -> Monday, January 1, 2024 */
  full: (date: string | Date, lang?: string) => {
    const d = toDate(date);
    return d ? format(d, 'EEEE, MMMM d, yyyy', { locale: getLocale(lang) }) : '';
  },

  /** 'PPP' -> Jan 1st, 2024 (Localized long date) */
  readable: (date: string | Date, lang?: string) => {
    const d = toDate(date);
    return d ? format(d, 'PPP', { locale: getLocale(lang) }) : '';
  },

  /** 'dd MMM yyyy HH:mm' -> 01 Jan 2024 14:30 */
  dateTime: (date: string | Date | null | undefined, lang?: string) => {
    const d = toDate(date);
    return d ? format(d, 'dd MMM yyyy HH:mm', { locale: getLocale(lang) }) : '';
  },

  /** 'yyyy-MM-dd' -> 2024-01-01 (Ideal for API payloads/filters) */
  isoDate: (date: string | Date) => {
    const d = toDate(date);
    return d ? format(d, 'yyyy-MM-dd') : '';
  },

  /** 'MMM yyyy' -> Jan 2024 (Ideal for Chart Axes and Grouping) */
  monthYear: (date: string | Date, lang?: string) => {
    const d = toDate(date);
    return d ? format(d, 'MMM yyyy', { locale: getLocale(lang) }) : '';
  },

  /** Relative time: '2 days ago' */
  relative: (date: string | Date, lang?: string) => {
    const d = toDate(date);
    return d ? formatDistanceToNow(d, { addSuffix: true, locale: getLocale(lang) }) : '';
  },
};
