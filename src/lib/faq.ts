import { getCollection } from 'astro:content';

/**
 * Ask AI's preloaded answers. The text lives in src/content/faq.yaml (editable in the web editor);
 * this file only gives it a shape and loads it in file order.
 */
export interface Faq {
  id: string;
  q: string;
  a: string;
  /** Words a visitor might use. Lowercase. */
  keywords: string[];
  links: { label: string; href: string }[];
  /** Offered as a one-tap suggestion when the assistant opens. */
  chip: boolean;
}

export async function getFaq(): Promise<Faq[]> {
  const entries = await getCollection('faq');
  return entries.map((e) => ({ id: e.id, ...e.data }));
}
