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
| **Add a show or exhibition** | In the web editor → Shows, or `src/content/shows.yaml`. Upcoming ones appear on the fair page; past ones on About. |
| **Change phone, email, Instagram, nav** | `src/lib/site.ts` |
| **Change colours or fonts** | `src/styles/global.css` (the top of the file) |

Not sure what a work is missing? `npm run content:report` writes a checklist to `docs/CONTENT-NEEDED.md`.

### The web editor (phone or computer)

**isaacandersonart.com/admin/** is a visual editor for the catalogue and the assistant's answers: change prices
and status, upload photos, add new works, reorder, edit what Ask AI says. Each save is committed to GitHub and
Cloudflare rebuilds the site by itself, so the change is online about 2–3 minutes later. Until go-live, use the
preview's editor: **https://isaacandersonart-v2.bobdylan2000.workers.dev/admin/**.

One-time setup (about two minutes):

1. On github.com: your photo → **Settings → Developer settings → Personal access tokens → Fine-grained tokens →
   Generate new token**. Repository access: *Only select repositories* → `IA-ART-Claude-Code`. Permissions:
   **Contents → Read and write**. Choose an expiry (up to a year) and copy the token.
2. Open `/admin/` on the site, choose **Sign In Using Access Token**, and paste it. Your browser remembers it.

The editor currently saves to the `v2` branch; change `branch:` in `public/admin/config.yml` to `main` once V2 is
merged and live. (A "Sign In with GitHub" button also works after a small OAuth setup — see sveltiacms.app.)

You can also make any edit on github.com (open the file → pencil icon → commit), or ask Claude.

---

## Ask AI and "View on your wall"

**Ask AI** (the button on every page) answers common questions instantly from `src/content/faq.yaml` —
edit it in the web editor (**Assistant answers**) or on GitHub to change or add answers. Questions the FAQ doesn't cover go to Claude through the
small Worker in `worker/`, which only knows what's in the catalogue and FAQ (it is told never to
invent prices, sizes or policies) and hands anything else to the studio.

To switch the AI on (no command line needed):

1. **Claude Console** (platform.claude.com) → **Settings → Workspaces** → create a workspace called *Website*.
   Select it → **Spend limits** → set a monthly cap (for example $20) and an alert. Then create an API key in
   that workspace and copy it. A separate workspace keeps the website's spending apart from the studio assistant's.
2. **Cloudflare dashboard** → **Workers & Pages** → `isaacandersonart-v2` → **Settings → Variables and Secrets →
   Add** → type **Secret**, name `ANTHROPIC_API_KEY`, paste the key → **Deploy**. Secrets survive every rebuild.

(From a terminal, `npx wrangler secret put ANTHROPIC_API_KEY` does the same as step 2.)

Without a key the assistant still works — FAQ answers and catalogue search are instant, and other
questions become a prefilled inquiry. Only questions the FAQ can't answer reach Claude, and each one sends
the catalogue and FAQ (about 18,000 characters, cached between a visitor's questions). Rough cost per such
question (November 2026 prices): **Opus 5.5** about 1–4¢, **Sonnet 5.5** about 1–2¢, **Haiku 5.5** about 0.1¢.
Settings in `wrangler.jsonc → vars` (change them in the repo, not the dashboard — each deploy rewrites them):
`ASSISTANT_MODEL` (default `claude-opus-5-5`; `claude-sonnet-5-5` or `claude-haiku-5-5` cost less) and
`ASSISTANT_EFFORT` (`low` = fastest replies). Each visitor is limited to about 12 questions a minute.

**View on your wall** appears on every work that has a width and height. It shows the piece at true
size in a sample room, or on a photo of the visitor's own wall; the photo never leaves their device.

## At art fairs

`/fair/` is a phone-first page for people who met you at a show: available works, one-tap text/call/Instagram,
and a keep-in-touch form tagged "Art fair page". Print the booth card with its QR code from
**isaacandersonart.com/fair/print/** (not linked anywhere, hidden from search).

## Running it locally

Needs Node 22.23.4 or newer (Astro 7's minimum; `.node-version` pins 22 for Cloudflare's builds).

```bash
npm install
npm run dev          # http://localhost:4321 — live-reloads as you edit
npm run build        # production build into dist/
npm run dev:worker   # build, then run the site + Worker locally in Cloudflare's runtime
npm run check        # type-check the site and the Worker
npm test             # build + browser tests on desktop and phone (first time: npx playwright install chromium)
npm run content:report
```

## Deploying (Cloudflare)

The site is plain static files in `dist/`, served by a Cloudflare Worker (`wrangler.jsonc`).

1. **Preview (running now):** the Worker `isaacandersonart-v2` is connected to this repo with Workers Builds
   (trigger "Preview from v2": `npm run build`, then `npx wrangler deploy`). Every push to `v2` — including
   web editor saves — rebuilds **https://isaacandersonart-v2.bobdylan2000.workers.dev** in about 2–3 minutes.
   The preview is hidden from search engines (`X-Robots-Tag: noindex` on `*.workers.dev`, see `public/_headers`).
   `npm run deploy` still works from a computer after `npx wrangler login`.
2. **Go live:** in the Cloudflare dashboard → Workers & Pages → `isaacandersonart-v2` → Settings → Domains,
   add `isaacandersonart.com` and `www.isaacandersonart.com`. (Remove them from the old Worker,
   `solitary-thunder-8ff9`, first.) The old Worker stays as an instant rollback: point the domains back.
3. **After go-live:** merge `v2` into `main`, switch the build trigger's branch to `main` (Settings → Builds) and
   the web editor's `branch:` to `main` (`public/admin/config.yml`), and turn on **Always Use HTTPS** for the
   domain (SSL/TLS → Edge Certificates).

Old v1 addresses (`/about.html`, `/available.html`, …) redirect to their new pages via `public/_redirects`.
Visitor statistics: **Web Analytics** is already on for the domain (Cloudflare adds it to every page; free,
no cookies) — the site's security policy allows it.

## How the code is organised

```
src/
  content/works/<slug>/    the catalogue — one folder per artwork
  content.config.ts        what fields a work can have (and their rules)
  lib/site.ts              contact details, navigation, collection descriptions
  lib/works.ts             helpers: titles, sizes, prices, related works
  lib/shows.ts             upcoming / past shows
  lib/structured-data.ts   schema.org data for Google (artist, artworks, breadcrumbs)
  layouts/Base.astro       <head> (titles, share previews), header, footer
  components/              Header, Footer, WorkCard, WorkGrid, ArtImage, InquiryForm,
                           InquiryList, AddToList, AskAI, WallView
  content/faq.yaml         Ask AI's preloaded answers (editable in /admin/)
  lib/faq.ts               loads the answers for the site and the assistant
  pages/                   one file per page; works/[slug].astro makes every artwork page
  styles/global.css        design tokens (colour, type, spacing) and shared styles
  styles/spec-sheet.css    how a work page prints (the one-page spec sheet)
  scripts/                 browser scripts: inquiry list, Ask AI, wall view, scroll reveal
  assets/site/             site photography (hero, interiors, process, portrait)
public/                    files served as-is (icons, robots.txt, _headers, _redirects)
public/admin/              the web editor (Sveltia CMS) and its config.yml
worker/                    Cloudflare Worker: /api/ask (Ask AI); everything else is static
tests/                     Playwright browser tests (pages, inquiry list, Ask AI, wall view)
docs/                      handoff, audit, plan, progress log, content checklist
scripts/                   maintenance scripts (content report, the one-time v1 migration)
```

Inquiry forms post to Formspree (`src/lib/site.ts → formEndpoint`).

The previous site (the Claude Design export) is preserved on the `main` branch.
