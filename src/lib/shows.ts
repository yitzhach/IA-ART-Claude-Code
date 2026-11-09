import { getCollection, type CollectionEntry } from 'astro:content';

export type Show = CollectionEntry<'shows'>;

/** Shows split into upcoming (soonest first) and past (latest first), as of the build. */
export async function getShows(now = new Date()): Promise<{ upcoming: Show[]; past: Show[] }> {
  const shows = await getCollection('shows');
  const lastDay = (s: Show) => s.data.end ?? s.data.start;
  const today = new Date(now.toISOString().slice(0, 10));
  return {
    upcoming: shows.filter((s) => lastDay(s) >= today).sort((a, b) => +a.data.start - +b.data.start),
    past: shows.filter((s) => lastDay(s) < today).sort((a, b) => +b.data.start - +a.data.start),
  };
}

const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });

/** "Feb 14–16, 2027" or "Feb 28 – Mar 2, 2027". */
export function showDates(s: Show): string {
  const { start, end } = s.data;
  if (!end || +end === +start) return fmt(start, { month: 'short', day: 'numeric', year: 'numeric' });
  if (start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear()) {
    return `${fmt(start, { month: 'short', day: 'numeric' })}–${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  }
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  return `${fmt(start, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })} – ${fmt(end, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}
