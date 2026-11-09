import { getCollection, type CollectionEntry } from 'astro:content';
import { collectionInfo, type CollectionKey } from './site';

export type Work = CollectionEntry<'works'>;

/** All works in display order. */
export async function getWorks(): Promise<Work[]> {
  const works = await getCollection('works');
  return works.sort((a, b) => a.data.order - b.data.order || a.id.localeCompare(b.id));
}

export function inCollection(works: Work[], key: CollectionKey): Work[] {
  return works.filter((w) => w.data.collections.includes(key));
}

export const workUrl = (w: Work) => `/works/${w.id}/`;

export const displayTitle = (w: Work) => w.data.title ?? 'Untitled';

/**
 * A name that identifies the piece unambiguously — the title, or "Untitled (Abstract 04)" for an
 * untitled work (from its folder name). Used wherever Isaac needs to know which piece is meant:
 * inquiries, the inquiry list, page titles, the assistant.
 */
export function refTitle(w: Work): string {
  if (w.data.title) return w.data.title;
  const m = w.id.match(/^untitled-([a-z]+)-(\d+)$/);
  return m ? `Untitled (${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]})` : `Untitled (${w.id})`;
}

/** "34 × 48 in" — width × height (× depth). Empty string when unknown. */
export function sizeLabel(w: Work): string {
  const { width, height, depth } = w.data;
  if (!width || !height) return '';
  return [width, height, depth].filter(Boolean).join(' × ') + ' in';
}

/** "86 × 122 cm" for international visitors. */
export function sizeLabelCm(w: Work): string {
  const { width, height, depth } = w.data;
  if (!width || !height) return '';
  return [width, height, depth].filter(Boolean).map((n) => Math.round(n! * 2.54)).join(' × ') + ' cm';
}

export const statusLabel: Record<Work['data']['status'], string> = {
  available: 'Available',
  reserved: 'Reserved',
  sold: 'Sold',
  commission: 'Commission',
  inquire: 'Inquire',
};

export function priceLabel(w: Work): string {
  if (w.data.status === 'sold') return 'Sold';
  if (w.data.status === 'reserved') return 'Reserved';
  if (w.data.status === 'commission') return 'Private commission';
  if (w.data.price) return `$${w.data.price.toLocaleString('en-US')}`;
  // Status not yet confirmed by Isaac: don't imply the piece is for sale.
  if (w.data.status === 'inquire') return 'Availability on request';
  return 'Price on request';
}

/** "Abstract · Sculptural" */
export const collectionsLabel = (w: Work) =>
  w.data.collections.map((c) => collectionInfo[c].name).join(' · ');

/** One-line summary used for alt text, meta descriptions and the AI assistant. */
export function summary(w: Work): string {
  const parts = [
    refTitle(w),
    collectionsLabel(w) && `${collectionsLabel(w).toLowerCase()} work`,
    w.data.medium,
    sizeLabel(w),
    w.data.year,
  ].filter(Boolean);
  return parts.join(', ');
}

export const altText = (w: Work) =>
  w.data.alt ?? `${refTitle(w)} — ${collectionsLabel(w) || 'mixed media'} work by Isaac Anderson`;

const LOOK_STOP = new Set(['with', 'over', 'from', 'into', 'above', 'below', 'base', 'band', 'panel', 'plaster', 'surface', 'small', 'large', 'shown', 'framed', 'field']);
/** Distinctive words from a work's description (colours, motifs, materials). */
const lookWords = (w: Work) =>
  new Set((w.data.alt ?? '').toLowerCase().match(/[a-z]{4,}/g)?.filter((t) => !LOOK_STOP.has(t)) ?? []);

/**
 * "More like this": works sharing a collection, ranked by how much their descriptions overlap
 * (palette, motif), then by catalogue order. Available works win ties.
 */
export function related(all: Work[], w: Work, n = 4): Work[] {
  const mine = lookWords(w);
  const score = (o: Work) => {
    let s = 0;
    for (const t of lookWords(o)) if (mine.has(t)) s += 1;
    if (o.data.status === 'available') s += 0.5;
    return s;
  };
  return all
    .filter((o) => o.id !== w.id && o.data.collections.some((c) => w.data.collections.includes(c)))
    .sort((a, b) => score(b) - score(a) || Math.abs(a.data.order - w.data.order) - Math.abs(b.data.order - w.data.order))
    .slice(0, n);
}
