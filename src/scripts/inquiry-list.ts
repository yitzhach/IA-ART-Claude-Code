/**
 * The visitor's inquiry list — works they want to ask about, kept on their own device
 * (localStorage). Designers often shortlist several pieces; one form then covers them all.
 */
export interface ListItem {
  slug: string;
  title: string;
  meta: string;
  thumb: string;
  url: string;
}

const KEY = 'ia-inquiry-list';
const EVENT = 'inquirylist:change';

export function getList(): ListItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(list: ListItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage blocked (private mode) — the list just won't persist */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: list }));
}

export const has = (slug: string) => getList().some((i) => i.slug === slug);

export function add(item: ListItem) {
  if (!has(item.slug)) save([...getList(), item]);
}

export function remove(slug: string) {
  save(getList().filter((i) => i.slug !== slug));
}

export function clear() {
  save([]);
}

/** Calls `fn` now and whenever the list changes (in this tab or another). */
export function onChange(fn: (list: ListItem[]) => void) {
  fn(getList());
  window.addEventListener(EVENT, () => fn(getList()));
  window.addEventListener('storage', (e) => e.key === KEY && fn(getList()));
}

/** Plain-text summary for the inquiry email. */
export const asText = (list: ListItem[]) =>
  list.map((i) => `${i.title}${i.meta ? ` (${i.meta})` : ''} — ${location.origin}${i.url}`).join('\n');
