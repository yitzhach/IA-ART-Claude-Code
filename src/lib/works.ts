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
  return 'Price on request';
}

export const isForSale = (w: Work) => w.data.status === 'available' || w.data.status === 'inquire';

/** "Abstract · Sculptural" */
export const collectionsLabel = (w: Work) =>
  w.data.collections.map((c) => collectionInfo[c].name).join(' · ');

/** One-line summary used for alt text, meta descriptions and the AI assistant. */
export function summary(w: Work): string {
  const parts = [
    displayTitle(w),
    collectionsLabel(w) && `${collectionsLabel(w).toLowerCase()} work`,
    w.data.medium,
    sizeLabel(w),
    w.data.year,
  ].filter(Boolean);
  return parts.join(', ');
}

export const altText = (w: Work) =>
  w.data.alt ?? `${displayTitle(w)} — ${collectionsLabel(w) || 'mixed media'} work by Isaac Anderson`;

/** Works sharing a collection, nearest in order first. */
export function related(all: Work[], w: Work, n = 4): Work[] {
  return all
    .filter((o) => o.id !== w.id && o.data.collections.some((c) => w.data.collections.includes(c)))
    .sort((a, b) => Math.abs(a.data.order - w.data.order) - Math.abs(b.data.order - w.data.order))
    .slice(0, n);
}
