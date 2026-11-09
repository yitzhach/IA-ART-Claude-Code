# Handoff — isaacandersonart.com V2

*Written 9 November 2026 at the end of the overnight build session, for the next Claude session (and Isaac).
Read this first, then `CLAUDE.md` (working rules), then the top of `docs/PROGRESS.md`.*

---

## 1. Where things stand

The V2 site is **complete, tested and not yet deployed**. It lives on the `v2` branch of
**github.com/yitzhach/IA-ART-Claude-Code**. `main` is the old v1 site (a Claude Design export) and still matches
what's live. Nothing has been merged, deployed, or changed in Cloudflare.

What happens next depends on Isaac: he supplies content and decisions (§7), reviews a private preview, then goes
live (§8). The visual tour he reviews from: **https://claude.ai/artifact/X4aVmg3vS3rNiop8ibPZVP** (private to him).

**Who Isaac is:** a sculptor/painter (cement, plaster, steel; studios in Southern California and Southern Kentucky).
Not a developer. He wants a world-class site that leads to sales, is fast on phones (art-fair visitors), is easy for
him to update (prices, photos, new works), and has an "Ask AI" assistant. He values relentless quality, plain-language
explanations, and autonomy when he's away — but **never** deploy, merge to `main`, or touch Cloudflare/DNS without
his explicit go-ahead.

---

## 2. The live site today (don't break it)

- **isaacandersonart.com** and **www** are served by the Cloudflare Worker **`solitary-thunder-8ff9`** (static assets
  from the v1 Claude Design export, last updated 28 Sep 2026).
- Other subdomains run on separate Workers — **leave them alone**: `artlab` (art-lab), `digilight` (hidden-glade-be7a),
  `digilight-deck` (spring-darkness-380c), `invoice`, `hero` (broad-recipe-48a6), `flare` (crimson-art-4838),
  `batch` (sweet-scene-0d27).
- Source of v1: the Claude Design project, artifact **"5pm-8-18-NEW--ART-HOMEPAGE"**
  (claude.ai/artifact/CZSKb33Z1rrwD7WkDqArVe). Standalone Claude Design closes 14 Dec 2026; V2 replaces it.
- Forms post to Formspree endpoint **`xaqrglpk`** (unchanged from v1).

---

## 3. Stack

| Piece | Choice | Notes |
|---|---|---|
| Site | **Astro 5.18.2** (pinned), static output | Astro 7 exists; staying on 5 was deliberate (stability). Upgrading is a contained job later. |
| Catalogue | Content collection, one folder per work | `src/content/works/<slug>/index.md` + photos; schema in `src/content.config.ts` |
| Styling | Tokens in `src/styles/global.css`, scoped component styles | No inline styles (CSP). Fonts self-hosted via `@fontsource`. |
| JS | Small vanilla scripts, heavy ones loaded on demand | `src/scripts/` (inquiry list, Ask AI, wall view) |
| Hosting | **Cloudflare Workers static assets** (`wrangler.jsonc`) | Worker runs only for `/api/*` (`run_worker_first`). Deploy name: `isaacandersonart-v2` (a new preview Worker). |
| Ask AI backend | `worker/` + `@anthropic-ai/sdk` 1.6.0 | `claude-opus-5-5`, effort `low`, JSON-schema output, server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`), cached system prompt. Model/effort in `wrangler.jsonc → vars`. Needs secret `ANTHROPIC_API_KEY`. |
| Web editor | **Sveltia CMS 0.252.0** (pinned) at `/admin/` | GitHub token sign-in; saves to branch `v2` (switch to `main` after go-live). Config `public/admin/config.yml`. |
| Security | Strict CSP + headers in `public/_headers` | `/admin/*` has its own looser policy (unpkg, GitHub API, jsDelivr fonts). |
| Redirects | `public/_redirects` | Every v1 URL 301s to its V2 page (incl. the designer's `/available.html` → `/works/?status=available`). |

---

## 4. Map of the code

```
src/content/works/<slug>/   46 works (index.md + photos). Folder name = URL.
src/content/faq.yaml        Ask AI's instant answers (12), editable in /admin/
src/content/shows.yaml      shows/exhibitions — empty until Isaac adds some
src/content.config.ts       schemas for works, faq, shows
src/lib/site.ts             contact details, nav, collection blurbs, Formspree endpoint
src/lib/works.ts            titles (refTitle for untitled), sizes, prices, related works
src/lib/shows.ts            upcoming/past shows, date formatting
src/lib/structured-data.ts  schema.org (artist, artworks, breadcrumbs)
src/layouts/Base.astro      <head>, header, footer, Ask AI button
src/components/             Header, Footer, WorkCard, WorkGrid, ArtImage, InquiryForm, InquiryList,
                            AddToList, AskAI, WallView, WorkTools, ShowList
src/pages/                  index, works/, works/[slug], collections/[collection], commissions, process,
                            about, inquire, fair/ (+ fair/print), 404, sitemap.xml, transitions.css,
                            assistant/knowledge.json (built catalogue + FAQ for Ask AI)
src/scripts/                ask.ts, inquiry-list.ts, wall-view.ts, reveal.ts
src/styles/                 global.css (tokens), spec-sheet.css (print layout)
worker/                     index.ts (routes, origin check, rate limit), assistant.ts (Claude call)
public/                     icons, _headers, _redirects, robots.txt, admin/ (web editor)
tests/                      Playwright: pages, inquiry, assistant, build, cms-config, worker
scripts/                    content-report.mjs (→ docs/CONTENT-NEEDED.md), migrate-v1.py (one-off, kept for history)
docs/                       HANDOFF (this), PROGRESS, V2-PLAN, CONTENT-NEEDED, AUDIT (of v1)
```

---

## 5. Commands and checks

```bash
npm ci                  # install (Node 20+)
npm run dev             # http://localhost:4321
npm run check           # astro check + Worker tsc — must be 0 errors
npm test                # astro build + Playwright on desktop & phone — 41 pass, 9 skipped (node-only tests run once)
npm run content:report  # regenerate docs/CONTENT-NEEDED.md after editing works
npm run dev:worker      # build + wrangler dev (site + Worker in workerd, applies _headers)
npm run deploy          # build + wrangler deploy → preview Worker isaacandersonart-v2 (only with Isaac's go-ahead)
```

What the tests cover: every key page (title, one h1, share image, no overflow, alt text, no `[placeholder]` text, no
errors); works filter; inquiry list end to end (Formspree intercepted); Ask AI instant answers, colour search and
hand-off; wall view; 320px header; phone menu focus; the editor config matching the schema; the Worker with a fake
Claude client; and build scans (no inline scripts/styles, unique view-transition names, no broken internal links).

---

## 6. Rules that matter (also in CLAUDE.md)

- **Never invent facts** — titles, sizes, years, prices, biography, exhibitions, shipping/care policies come from Isaac.
  Unknown fields are left out; `content:report` lists them. **No placeholder ever renders** (tests enforce it).
- Sizes are **width × height in inches**. Untitled works display as **"Untitled (Abstract 04)"** (from the folder
  name) so inquiries are unambiguous.
- Statuses: `available` (for sale, "Price on request" unless `price`), `reserved`, `sold`, `commission`,
  `inquire` (status unconfirmed → "Availability on request"). 4 available, 8 sold, 34 unconfirmed.
- The FAQ and the AI prompt state only what's true; unknowns hand off to Isaac.
- When adding/renaming a work field, update `public/admin/config.yml` too (editors drop unknown fields; a test checks).
- Any new third-party script/style/font/API → update the CSP in `public/_headers` and test under `npm run dev:worker`.
- Commit and push to `v2` after every meaningful step. Plain-language summaries for Isaac.

---

## 7. Waiting on Isaac

**Content** (full per-work list in `docs/CONTENT-NEEDED.md`):
1. Titles, sizes, years for the **37 untitled works**; medium for all works.
2. Prices for the 4 available works (or keep "Price on request"); real status for the 34 unconfirmed works.
3. About page: training/background (v1 had only placeholders), exhibitions, press.
4. Review the assistant's answers (`src/content/faq.yaml` / web editor) — add care, payment, shipping, show dates.
5. Approve the drafted Figurative and Sculptural blurbs (`src/lib/site.ts`) and the per-work `alt` descriptions
   (written by Claude from the photos).
6. Up to 8 `featured: true` works (until then the home page leads with everything for sale).
7. Upcoming shows — his **Show Ledger** artifact (claude.ai/artifact/M1Ar1dc5PMQ2xzRmzyC8Zw) has the 2027 Florida
   season; copy it into `shows.yaml` **only if he says so**.
8. Questions: are `untitled-abstract-04` and `untitled-sculptural-09` the same piece? A straight-on photo of
   *Lifted Up* (its only photo is an outdoor installation shot)? Are the unused `src/assets/site/hero-macro-2/3/6.webp`
   and `process-hero-2.webp` (a triptych) works that belong in the catalogue?

**Decisions:**
1. Show prices publicly, or "Price on request"?
2. Checkout: Stripe Payment Links (`buyLink:` per work adds "Buy now"), a deposit to reserve, or inquiry only?
3. Turn on AI answers (API key + monthly spend limit)? Keep `claude-opus-5-5` or use `claude-haiku-5-5` (~1/40 the cost)?
4. Public email: keep Gmail or set up `studio@isaacandersonart.com` (Cloudflare Email Routing)?
5. Formspree free plan = 50 submissions/month — upgrade if needed.

---

## 8. Going live (with Isaac, step by step)

1. `npx wrangler login`, then `npm run deploy` → preview at `isaacandersonart-v2.<account>.workers.dev`. Review together.
   (First upload is ~170 MB of image sizes across 833 files; later deploys upload only changes.)
2. If AI answers are wanted: `npx wrangler secret put ANTHROPIC_API_KEY`; test a few questions on the preview.
3. Web editor: Isaac creates a fine-grained GitHub token (repo IA-ART-Claude-Code, Contents read/write) and signs in at
   `/admin/` on the preview. Test one real edit end to end.
4. Cloudflare dashboard: remove isaacandersonart.com + www from `solitary-thunder-8ff9`, add them to
   `isaacandersonart-v2`. The old Worker stays as an instant rollback.
5. Merge `v2` into `main`; set `branch: main` in `public/admin/config.yml`; optionally connect Workers Builds to `main`
   (build command `npm run build`) so every edit redeploys.
6. Turn on Cloudflare Web Analytics (already allowed by the CSP). Submit the sitemap in Google Search Console.

---

## 9. Not verified yet / known limitations

- **Never run against real services:** the web editor's sign-in and save (needs Isaac's token), and Ask AI's live
  Claude answers (needs a key). Both were exercised up to that point with stand-ins: the editor boots and parses its
  config; the Worker was tested in workerd against a mock Claude API.
- Lighthouse (mobile, compressed like Cloudflare): Accessibility / Best Practices / SEO 100; Performance 100 on Works,
  ~79–88 on image-led pages under the slow-4G simulation. Not measured on Cloudflare itself. AVIF was tested and
  rejected (bigger than WebP on these textured surfaces).
- The empty `shows` collection prints a harmless "collection is empty" warning during builds.
- `/studio.html` (v1's private image tool) was dropped; its URL redirects home.

---

## 10. Notes for cloud sessions

- The sandbox blocks `unpkg.com`, `cdn.jsdelivr.net` and `isaacandersonart.com`; npm registry and Google Fonts are
  reachable. To test the web editor locally, route `unpkg.com/@sveltia/cms@0.252.0/*` to the npm package's files.
- The clone may track only `main`. If `git status` shows no upstream for `v2`:
  `git config --add remote.origin.fetch '+refs/heads/v2:refs/remotes/origin/v2' && git fetch origin && git branch -u origin/v2`.
- GitHub prints "This repository moved" on push (case change in the repo name) — harmless.
- Playwright: `@playwright/test` is pinned to 1.63.0 to match the preinstalled browser; don't run `playwright install`
  in the cloud sandbox.
- To test Ask AI end to end without a key: run a tiny mock of `POST /v1/messages` and start
  `wrangler dev --var ANTHROPIC_API_KEY:test --var ANTHROPIC_BASE_URL:http://127.0.0.1:<port>`.
