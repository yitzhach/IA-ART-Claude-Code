import { defineCollection, z } from 'astro:content';
import { file, glob } from 'astro/loaders';

/**
 * The catalogue. One folder per artwork:
 *
 *   src/content/works/<slug>/index.md   ← details below, plus an optional statement as the body
 *   src/content/works/<slug>/main.webp  ← first image is the cover; add more and list them
 *
 * The folder name is the work's URL: /works/<slug>/.
 */
export const COLLECTIONS = ['abstract', 'figurative', 'sculptural'] as const;
export const STATUSES = ['available', 'reserved', 'sold', 'commission', 'inquire'] as const;

const works = defineCollection({
  loader: glob({
    pattern: '*/index.md',
    base: './src/content/works',
    generateId: ({ entry }) => entry.replace(/\/index\.md$/, ''),
  }),
  schema: ({ image }) =>
    z.object({
      /** Leave out if the piece has no title yet — it shows as "Untitled". */
      title: z.string().optional(),
      collections: z.array(z.enum(COLLECTIONS)).default([]),
      /**
       * available  — for sale now
       * reserved   — on hold for a buyer
       * sold       — sold (stays in the portfolio)
       * commission — made to commission; shown as past commission work
       * inquire    — availability not stated; visitors are invited to ask
       */
      status: z.enum(STATUSES).default('inquire'),
      /** Price in US dollars. Leave out to show "Price on request". */
      price: z.number().positive().optional(),
      /** Stripe Payment Link (or any checkout URL). Adds a "Buy now" button when status is available. */
      buyLink: z.string().url().optional(),
      /** Inches. Width × height as hung; depth optional. */
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
      depth: z.number().positive().optional(),
      medium: z.string().optional(),
      year: z.number().int().min(1990).max(2100).optional(),
      /** Image files in this folder. The first is the cover. */
      images: z.array(image()).min(1),
      /** Short visual description for screen readers and the AI assistant. */
      alt: z.string().optional(),
      /** Show on the home page. */
      featured: z.boolean().default(false),
      /** Lower numbers come first. */
      order: z.number().default(1000),
      /** Old v1 image ids this work replaced (for reference only). */
      v1: z.array(z.string()).default([]),
    }),
});

/** Ask AI's preloaded answers — src/content/faq.yaml (also editable in the web editor). */
const faq = defineCollection({
  loader: file('src/content/faq.yaml'),
  schema: z.object({
    q: z.string(),
    a: z.string(),
    keywords: z.array(z.string()).min(1),
    links: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
    chip: z.boolean().default(false),
  }),
});

/** Shows, fairs and exhibitions — src/content/shows.yaml (also editable in the web editor). */
const shows = defineCollection({
  loader: file('src/content/shows.yaml'),
  schema: z.object({
    name: z.string(),
    venue: z.string().optional(),
    city: z.string(),
    start: z.coerce.date(),
    end: z.coerce.date().optional(),
    url: z.string().url().optional(),
    kind: z.enum(['fair', 'exhibition', 'open-studio']).default('fair'),
  }),
});

export const collections = { works, faq, shows };
