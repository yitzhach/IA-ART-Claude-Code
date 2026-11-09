# isaacandersonart.com

The website of Isaac Anderson — sculptural art in cement, plaster and steel.
Built with [Astro](https://astro.build): fast static pages, one folder per artwork, hosted on Cloudflare.

---

## Everyday changes

Every artwork is a folder in **`src/content/works/`**. The folder name is its web address:
`src/content/works/green-horizon/` → `isaacandersonart.com/works/green-horizon/`.

Inside each folder: an `index.md` file with the details, and the photos.

```yaml
---
title: Green Horizon
collections: [abstract]          # abstract, figurative, sculptural — one or more
status: available                # available · reserved · sold · commission · inquire
price: 4800                      # US dollars. Delete the line to show "Price on request"
width: 34                        # inches, as hung
height: 48
depth: 2.5                       # optional
medium: Cement, plaster and pigment on panel
year: 2025
images:
  - ./main.webp                  # first photo is the cover
  - ./detail.webp
featured: true                   # show on the home page
order: 401                       # lower numbers come first
---

A sentence or two about the piece. Optional — shown on the work's page.
```

| To… | Do this |
|---|---|
| **Change a price** | Edit `price:` in the work's `index.md`. |
| **Mark a piece sold** | Change `status: available` to `status: sold`. It stays in the portfolio with a "Commission something similar" button. |
| **Add a new work** | Copy any work folder, rename it (lowercase-with-dashes), replace the photo, edit `index.md`. |
| **Add photos** | Drop the image files in the work's folder and list them under `images:`. JPG, PNG or WebP, any size — the site makes web-sized copies automatically. (iPhone HEIC photos: export as JPG first.) |
| **Reorder** | Change `order:` numbers. |
| **Feature on the home page** | Add `featured: true` (up to 8 are shown). |
| **Add a "Buy now" button** | Create a Stripe Payment Link and add `buyLink: https://buy.stripe.com/…` to an available work. |
| **Change phone, email, Instagram, nav** | `src/lib/site.ts` |
| **Change colours or fonts** | `src/styles/global.css` (the top of the file) |

Not sure what a work is missing? `npm run content:report` writes a checklist to `docs/CONTENT-NEEDED.md`.

You can make all of these edits on github.com (open the file → pencil icon → commit), or ask Claude.

---

## Ask AI and "View on your wall"

**Ask AI** (the button on every page) answers common questions instantly from `src/lib/faq.ts` —
edit that file to change or add answers. Questions the FAQ doesn't cover go to Claude through the
small Worker in `worker/`, which only knows what's in the catalogue and FAQ (it is told never to
invent prices, sizes or policies) and hands anything else to the studio.

To switch the AI on after deploying, add your Anthropic API key as a secret:

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

Without a key the assistant still works — FAQ answers and catalogue search are instant, and other
questions become a prefilled inquiry. Settings in `wrangler.jsonc → vars`:
`ASSISTANT_MODEL` (default `claude-opus-5-5`; `claude-haiku-5-5` costs about 1/40th as much) and
`ASSISTANT_EFFORT` (`low` = fastest replies). Set a monthly spend limit in the Anthropic Console.
Each visitor is limited to about 12 questions a minute.

**View on your wall** appears on every work that has a width and height. It shows the piece at true
size in a sample room, or on a photo of the visitor's own wall; the photo never leaves their device.

## Running it locally

Needs Node 20 or newer.

```bash
npm install
npm run dev          # http://localhost:4321 — live-reloads as you edit
npm run build        # production build into dist/
npm run dev:worker   # build, then run the site + Worker locally in Cloudflare's runtime
npm run check        # type-check the site and the Worker
npm run content:report
```

## Deploying (Cloudflare)

The site is plain static files in `dist/`, served by a Cloudflare Worker (`wrangler.jsonc`).

1. **Preview first:** `npm run deploy` (build + `wrangler deploy`) publishes to a separate preview Worker
   (`isaacandersonart-v2`) with its own `*.workers.dev` address. The live site is not touched.
2. **Go live:** in the Cloudflare dashboard → Workers & Pages → `isaacandersonart-v2` → Settings → Domains,
   add `isaacandersonart.com` and `www.isaacandersonart.com`. (Remove them from the old Worker,
   `solitary-thunder-8ff9`, first.) The old Worker can stay as an instant rollback.
3. **Automatic deploys (optional):** connect this GitHub repo in Workers & Pages → Settings → Builds, with build
   command `npm run build`. Every push to the chosen branch then redeploys.

Old v1 addresses (`/about.html`, `/available.html`, …) redirect to their new pages via `public/_redirects`.
For visitor statistics, turn on **Web Analytics** for the domain in the Cloudflare dashboard (free, no cookies).

## How the code is organised

```
src/
  content/works/<slug>/    the catalogue — one folder per artwork
  content.config.ts        what fields a work can have (and their rules)
  lib/site.ts              contact details, navigation, collection descriptions
  lib/works.ts             helpers: titles, sizes, prices, related works
  layouts/Base.astro       <head> (titles, share previews), header, footer
  components/              Header, Footer, WorkCard, WorkGrid, ArtImage, InquiryForm,
                           InquiryList, AddToList, AskAI, WallView
  lib/faq.ts               the assistant's preloaded answers
  pages/                   one file per page; works/[slug].astro makes every artwork page
  styles/global.css        design tokens (colour, type, spacing) and shared styles
  scripts/                 browser scripts: inquiry list, Ask AI, wall view, scroll reveal
  assets/site/             site photography (hero, interiors, process, portrait)
public/                    files served as-is (icons, robots.txt, _headers, _redirects)
worker/                    Cloudflare Worker: /api/ask (Ask AI); everything else is static
docs/                      audit, plan, progress log, content checklist
scripts/                   maintenance scripts (content report, the one-time v1 migration)
```

Inquiry forms post to Formspree (`src/lib/site.ts → formEndpoint`).

The previous site (the Claude Design export) is preserved on the `main` branch.
