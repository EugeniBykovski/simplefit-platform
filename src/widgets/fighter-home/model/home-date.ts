/**
 * Calendar facts of the Fighter home header (SF-40), in the browser's own
 * time zone: the user's day, not the server's.
 */

const DAY_MS = 86_400_000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * The user's day with SimpleFit, counted from Fighter onboarding completion
 * (`completed_at`, backend-owned): day 1 is the day it completed. `undefined`
 * without a valid completion time; never below 1.
 */
export function dayWithSimpleFit(completedAt: string | null, now: Date): number | undefined {
  if (completedAt === null) return undefined;
  const completed = new Date(completedAt);
  if (Number.isNaN(completed.getTime())) return undefined;
  return Math.max(1, Math.round((startOfDay(now) - startOfDay(completed)) / DAY_MS) + 1);
}

/** "Sat · Oct 3" in the locale's words and order. */
export function headerDate(locale: string, now: Date): string {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(now);
  const day = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(now);
  return `${weekday} · ${day}`;
}

/** The greeting of the normal home (W01): morning before 12, afternoon before 18. */
export function partOfDay(now: Date): "morning" | "afternoon" | "evening" {
  const hour = now.getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}
