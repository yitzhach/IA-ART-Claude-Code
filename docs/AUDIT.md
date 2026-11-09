# Site audit — isaacandersonart.com v1

*Audited 2026-11-09 by Claude. Source: the `main` branch of this repo (identical, file for file, to the
`dist/` folder of the Claude Design project "5pm-8-18-NEW--ART-HOMEPAGE", which was deployed to the
Cloudflare Worker `solitary-thunder-8ff9` on 2026-09-28). Every page was loaded in Chromium at desktop
(1440px) and phone sizes (iPhone 13, iPhone SE, Pixel 7), timed on a throttled "slow 4G" phone
connection, and read in source. The live domain itself is blocked from the audit sandbox.*

---

## Critical — visible to visitors, costing inquiries

| # | Problem | Where |
|---|---------|-------|
| 1 | **Inquiry form is ~600px wide on 320–412px phone screens** — fields and the Send button run off the right edge. This is the main lead form. | Home, Commissions, About |
| 2 | **~85 placeholders are live:** "[Title, size, year]" under all 36 collection images; About has "Trained in [discipline] at [school]… since [year]", "[Show title] [Venue], [City] · [year]", "[Publication]"… (22 more); every Available detail panel says "[Short statement about this piece…]" and "[Shipping and installation notes.]". | Abstract, Figurative, Sculptural, About, Available |
| 3 | **Hero title collides with text on phones** — "ANDERSON" prints over "Mixed media · 2026 · Custom piece". | Home |
| 4 | **9 of 10 pages have no `<title>`, no description, no language tag; no page has Open Graph tags.** Shared links (iMessage, Instagram DMs, email, Facebook) show no image and no title; Google shows bare URLs. | All but Home |
| 5 | **Sold works say "Available".** All 12 Available-page detail panels are hard-coded `Available`, including the ones badged SOLD. No. 001 and No. 002 are both titled "Green Horizon, 34 × 48". | Available |
| 6 | Two images referenced by pages are missing from this repo (present in the Claude Design project): `object-009.webp` (No. 009 card on Home), `ref-6-hi.webp` (Available). 7 more design-project images are missing but unused. | Repo only |

## Speed

| Page | First heading (slow 4G phone) | Main image (LCP) | Everything loaded | Page weight |
|------|------------------------------|------------------|-------------------|-------------|
| Home | 2.6 s | 9.7 s | 13 s | 2.5 MB |
| Available | 2.6 s | 11.0 s | 41 s | 8.3 MB |
| Abstract | 2.0 s | 7.0 s | **55 s** | **11.2 MB** |

- **The pages are drawn in the browser** by Claude Design's runtime (`support.js`), which downloads React
  from `unpkg.com` on every visit. Nothing appears until that third-party CDN answers; if unpkg is slow
  or down, the site is blank. Search engines and link previews see template code, not a page.
- **The Abstract page silently preloads all 12 full-size images (10.6 MB)** in a hidden block.
- 128 images / 51 MB; 19 files over 1 MB; no responsive sizes (`srcset`), no AVIF. The same artwork is
  stored up to 4× under different names.
- **Editor-only code ships to visitors:** `image-slot.js` (130 KB incl. editor UI), `hero-timeline.js`
  (37 KB editor dock), `image-library.js`, nine `*.state.json` files fetched on load. The Studio page pulls a
  2.9 MB HEIC converter.

## Structure and content

- **One artwork, many identities.** e.g. the same painting is Abstract No. 001, Available No. 010 and
  Sculptural No. 010; another is Abstract No. 004, Available No. 012 and Sculptural No. 012. The
  "36 images" catalogue double-counts, and numbers don't match between pages.
- **No page per artwork.** A piece can't be linked, shared, found on Google, or bought on its own. Collection
  pages show no title, size, price or status.
- **No purchase path.** Everything is "price on request"; the only "add to inquiry" list lives on the
  (unlinked) Available page.
- Navigation and theme differ between pages (Available is dark with a Home/Contact nav and an older build stamp).
- No analytics, `robots.txt`, `sitemap.xml`, 404 page, or structured data.
- Personal Gmail address published on About (spam harvesting; a `studio@isaacandersonart.com` address via
  free Cloudflare Email Routing reads as more established).
- `/studio.html` (private image tool) is public; its passcode is readable in the page source. Low risk
  (it only converts images in the browser) but it shouldn't ship with the public site.
- Forms: "Project type" shows "Private Collection" preselected, so the required check never fires.
- **Code:** every element is styled inline (`style="…"`) — one design change means editing dozens of
  places in ten files. Nav, footer and forms are copy-pasted into every page. No shared stylesheet.
- **Accessibility:** artwork images have no alt text; the main heading reads "Isaac + anderson" to screen
  readers; the floating back-to-top button covers form labels and the footer on phones.

## What's working — keep it

- The visual identity: Bodoni Moda / Newsreader / Archivo / IBM Plex Mono, the warm plaster palette and rust accent. Distinctive and right for the work.
- The writing on Process and Commissions.
- The 4-step commission process, the "8–12 weeks · to-the-trade welcome" line, in-situ room photography.
- Mobile details already considered (16px inputs, 44px tap targets, safe areas).
- The "add to inquiry" list idea — it becomes the V2 purchase flow.
