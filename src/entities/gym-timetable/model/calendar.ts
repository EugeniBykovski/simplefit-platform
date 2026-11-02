/*
 * Calendar arithmetic for the timetable, on wall dates only (`YYYY-MM-DD`).
 * No class is ever computed here: a day column shows the classes whose own
 * wall date (the backend's `local_starts_at` in the class's zone) is that
 * day. Instants are only used to ask the backend for a window wide enough to
 * hold every class of those wall dates in any zone.
 */

const DAY = 24 * 60 * 60 * 1000;
/** The furthest any zone's wall clock is from UTC (Pacific/Kiritimati +14, Etc/GMT+12). */
const ZONE_REACH = 14 * 60 * 60 * 1000;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A wall date as the UTC midnight that carries it (calendar arithmetic only). */
function utcMidnight(date: string): number {
  const match = DATE.exec(date);
  if (match === null) throw new RangeError(`Not a date: ${date}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function dateOf(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

export function isWallDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  return dateOf(utcMidnight(value)) === value;
}

/** `date` moved by `days` calendar days. */
export function addDays(date: string, days: number): string {
  return dateOf(utcMidnight(date) + days * DAY);
}

/** Calendar days from `from` to `to`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcMidnight(to) - utcMidnight(from)) / DAY);
}

/** ISO weekday of a wall date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  const day = new Date(utcMidnight(date)).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * The first day of the week in `locale` (ISO weekday), from the browser's
 * CLDR week data where it has it; otherwise Monday, except for the locales
 * whose region starts on Sunday by default.
 */
export function firstDayOfWeek(locale: string): number {
  try {
    const intl = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const info = intl.getWeekInfo?.() ?? intl.weekInfo;
    if (info && info.firstDay >= 1 && info.firstDay <= 7) return info.firstDay;
  } catch {
    // An unknown locale tag: fall through.
  }
  return /^en(-US)?$/i.test(locale) ? 7 : 1;
}

/** The first day of the week holding `date`, the week starting on `firstDay`. */
export function weekStart(date: string, firstDay: number): string {
  return addDays(date, -((isoWeekday(date) - firstDay + 7) % 7));
}

/** `count` consecutive wall dates from `start`. */
export function datesFrom(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}

/**
 * The instants to ask for so that every class whose wall date is one of
 * `first` … `last` is listed, in any zone: from 14 hours before the first
 * date's UTC midnight to 14 hours after the last date's end. Classes of the
 * edges' neighbouring days come back too and are simply not shown. Never
 * more than the backend's 31 days for a week.
 */
export function windowFor(first: string, last: string): { from: string; to: string } {
  return {
    from: new Date(utcMidnight(first) - ZONE_REACH).toISOString(),
    to: new Date(utcMidnight(last) + DAY + ZONE_REACH).toISOString(),
  };
}

/** The wall date of a backend wall time (`YYYY-MM-DDTHH:MM:SS`). */
export const wallDate = (local: string) => local.slice(0, 10);
/** Minutes after the wall date's midnight of a backend wall time. */
export const wallMinutes = (local: string) =>
  Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
/** `HH:MM` of a backend wall time. */
export const wallClock = (local: string) => local.slice(11, 16);

/** A wall date as a Date at its UTC noon, to print with `timeZone: "UTC"` in any locale. */
export const printable = (date: string) => new Date(utcMidnight(date) + DAY / 2);

/** A class on a day column: where it starts and ends (minutes) and its lane. */
export type Placed<T> = { item: T; start: number; end: number; lane: number; lanes: number };

/**
 * Lays one day's classes out in lanes: classes that overlap in time (in
 * different venues) sit side by side, the rest use the full width. `start`
 * and `end` are minutes of the day; an end past midnight stays at 24:00.
 */
export function layoutDay<T>(
  items: readonly T[],
  span: (item: T) => { start: number; end: number },
): Placed<T>[] {
  const sorted = items
    .map((item) => {
      const { start, end } = span(item);
      return { item, start, end: Math.min(Math.max(end, start + 1), 24 * 60), lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const placed: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let clusterEnd = -1;
  const close = () => {
    const lanes = cluster.reduce((most, entry) => Math.max(most, entry.lane + 1), 1);
    for (const entry of cluster) entry.lanes = lanes;
    placed.push(...cluster);
    cluster = [];
  };

  for (const entry of sorted) {
    if (entry.start >= clusterEnd && cluster.length > 0) close();
    const busy = new Set(cluster.filter((other) => other.end > entry.start).map((o) => o.lane));
    let lane = 0;
    while (busy.has(lane)) lane += 1;
    entry.lane = lane;
    cluster.push(entry);
    clusterEnd = Math.max(clusterEnd, entry.end);
  }
  if (cluster.length > 0) close();
  return placed;
}
