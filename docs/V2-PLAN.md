# isaacandersonart.com — V2 plan

## Goals (from Isaac)

- Fresh, polished, fast — not bloated. Mobile and desktop.
- Easy to **buy a painting**, **inquire**, or **start a commission**.
- **"Ask AI"** button on every page: instant answers to a preloaded FAQ, commission process, pricing
  guidance, help finding pieces — and a **design assistant** that places a piece on your own wall.
- Built for designers, collectors and art-fair visitors (often on a phone, often on weak signal).
- A clean, efficient codebase that's pleasant to keep working in.
- Very easy to add new work, change prices, mark pieces sold, and reorder things.
- Hosted on Cloudflare (Isaac deploys).

## Architecture

| Concern | Choice | Why |
|---|---|---|
| Site generator | **Astro 5** (pinned 5.18.x) | Real HTML at build time (fast, crawlable), zero JS by default, shared components, built-in image pipeline. Upgrade to Astro 7 later is a contained job. |
| The catalogue | `src/content/works/<slug>/index.md` + that work's images in the same folder | One file per artwork = one place to change price/status/title. Add a work = add a folder. Works with any Git-based CMS later. |
| Site-wide text | `src/content/site.ts` (contact, studios, nav), `src/content/faq.yaml` | No hunting through page markup for a phone number. |
| Styling | `src/styles/tokens.css` + `global.css`, scoped component styles | Change a colour or font once. No inline styles. |
| JavaScript | Small vanilla scripts only where needed: mobile nav, lightbox, filters, inquiry list, Ask AI panel, wall view | Fast on phones; nothing to download before the page shows. |
| Images | Originals in the work folder; Astro generates AVIF/WebP at several widths with `srcset` | Phones download ~150 KB instead of ~1.3 MB per image. |
| Forms | Formspree (existing endpoint `xaqrglpk`), prefilled with the chosen work(s) | Works on static hosting today; can move to a Worker later. |
| Hosting | Cloudflare Workers static assets (`wrangler.jsonc`, `dist/`); `/api/*` handled by a small Worker for Ask AI | Same Worker + domain as today. |

## Information architecture

- **Home** — hero, featured available works, the three collections, commissions, inquiry.
- **Works** `/works/` — every piece once, filterable by collection and status (available / sold / commission).
- **Work detail** `/works/<slug>/` — images, title, size, medium, year, status, price or "price on request",
  **Inquire / Buy**, **View on your wall**, related works. Shareable link with preview image.
- **Collections** `/collections/<abstract|figurative|sculptural>/`.
- **Commissions** — process, lead times, form. **Process**, **About**, **Contact**.
- **Inquiry list** — "Add to inquiry" on any work; one form sends the whole list (designers pull several).
- **Ask AI** — floating button on every page → panel with instant FAQ answers, free-text questions answered
  from the catalogue + FAQ only (never invented prices), and actions: show matching works, open wall view,
  start an inquiry.
- **Wall view** — try a work in sample rooms or on a photo of your own wall, scaled to its real size.
  Runs entirely in the browser; the photo never leaves the device.

## Phases

### Phase 1 — Foundation  ← tonight
- [x] Astro project scaffold, pinned deps, `npm run dev / build / preview`, `.gitignore`, README
- [x] Design tokens + global CSS ported from v1 (fonts, palette, type scale)
- [x] Layout: `<head>` with title/description/OG/canonical, nav (desktop + mobile), footer
- [x] Catalogue schema (`src/content.config.ts`) + migration of every v1 artwork, de-duplicated
- [x] Pages ported: Home, Works, Collections ×3, Commissions, Process, About, 404
- [x] All v1 phone bugs fixed (form overflow, hero overlap, back-to-top overlap)
- [x] No placeholder ever renders — missing fields are simply omitted
- [x] `robots.txt`, sitemap, structured data (VisualArtwork / Offer)
- [x] Recover the missing images from the Claude Design project (3 sharper work photos, 1 new work, a show photo)

### Phase 2 — Buying and inquiring
- [x] Work detail pages with status/price rules (`available`, `reserved`, `sold`, `commission`, `inquire`)
- [x] Inquiry list across the site + prefilled Formspree form (works, notes, wall size)
- [x] Optional `buyLink` per work (Stripe Payment Link) → "Buy now" button
- [x] Commission form with project type, timeline, location and size; "I am a" (designer, architect…) on every form
- [x] Fold the designer's Available page in as a filtered view (`/works/?status=available`)

### Phase 3 — Ask AI
- [x] `src/lib/faq.ts` — commission process, lead times, shipping, install, care, materials, pricing guidance
- [x] Panel UI (keyboard + screen reader friendly), instant FAQ matching with no network call
- [x] `/api/ask` Worker: answers grounded in catalogue + FAQ, cites works with links, hands off to inquiry
- [x] Guardrails: never invent prices or availability; offer to connect with Isaac

### Phase 4 — Wall view
- [x] Sample rooms with known scale; work rendered at true size
- [x] "Use my wall": photo upload, set scale from a known width, drag/resize, save image

### Phase 5 — Operations
- [x] Cloudflare Web Analytics (privacy-friendly, free) — a dashboard switch, documented in README
- [x] 301 redirects from every v1 address (`public/_redirects`)
- [x] Deploy guide (Workers Builds from GitHub, or `wrangler deploy`)
- [ ] Optional web editor (Keystatic / Decap) so prices and new works can be edited from a phone
- [x] Move `/studio.html` off the public site

## Decisions waiting on Isaac

1. **Prices:** show real prices on available works, or keep "price on request"? Commission pricing guidance
   for the AI (e.g. per square foot, typical ranges)?
2. **Checkout:** "Buy now" via Stripe Payment Links, a deposit to reserve, or inquiry-only?
3. **AI provider:** Claude API (best answers; needs an API key) or Cloudflare Workers AI (no key, included with the account)?
4. **Public email:** keep Gmail or set up `studio@isaacandersonart.com`?
5. **Studio tool:** drop it from the site, or protect it with Cloudflare Access?

## Content only Isaac can supply

See `docs/CONTENT-NEEDED.md` (generated from the catalogue: every work missing a title, size, year,
medium, price or statement, plus the About-page biography gaps).
