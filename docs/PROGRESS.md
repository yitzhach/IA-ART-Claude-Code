# Progress log

Working branch: **`v2`**. `main` is untouched and still matches the live site.
Nothing is deployed to Cloudflare — Isaac deploys.

## How to resume (for Claude)

1. `git clone https://github.com/yitzhach/ia-art-claude-code && cd ia-art-claude-code && git checkout v2`
2. Read `docs/V2-PLAN.md` (checklist) and the latest entry below.
3. `npm ci && npm run build` to confirm a clean state, then continue with the next unchecked item.
4. Commit + push to `v2` after every meaningful step.

Reference material: the v1 site lives on `main` (`git show main:index.html`). The original Claude Design
project is the artifact "5pm-8-18-NEW--ART-HOMEPAGE" (claude.ai/artifact/CZSKb33Z1rrwD7WkDqArVe).

## Log

### 2026-11-09 00:40 ET — session 1
- Audited v1 (desktop, 3 phones, slow-4G timing, source) → `docs/AUDIT.md`.
- Wrote the V2 plan → `docs/V2-PLAN.md`.
- Created branch `v2`. Starting Phase 1.

### 2026-11-09 01:22–01:40 ET — session 2
- Built the V2 site on Astro 5: shared layout (titles, descriptions, share previews on every page), header with
  mobile menu, footer, design tokens in `src/styles/global.css`.
- Catalogue: 46 unique works (from 84 v1 slots). One page per work at `/works/<slug>/` with size (in + cm), status,
  price, inquiry form, related works and structured data.
- Pages: Home, Works (filters: collection, available now), 3 Collections, Commissions, Process, About, Inquire, 404,
  sitemap.xml, robots.txt.
- Inquiry list: save works while browsing, send one inquiry for all of them (tested end to end).
- README (how to change prices, mark sold, add works), `npm run content:report` → `docs/CONTENT-NEEDED.md`,
  `wrangler.jsonc` (deploys to a separate preview Worker first), `_headers`.
- QA: every page checked at 1440px desktop and iPhone 13 — no overflow, broken images, missing alt text or placeholders.
- Next: Ask AI panel (instant FAQ, then optional Claude-powered answers via a Worker), wall view, analytics.

### 2026-11-09 01:40–01:55 ET — session 2 (continued)
- **Ask AI** on every page: instant FAQ answers (`src/lib/faq.ts`) and catalogue search on the device; other
  questions go to `POST /api/ask` (Cloudflare Worker → Claude, grounded in `/assistant/knowledge.json`); without an
  API key or on any error, a one-tap hand-off to the studio with the question prefilled. Tested end to end in
  workerd against a mock Claude API, plus a phone-viewport browser test (10/10).
- **View on your wall**: true-scale preview in a sample room (84-in sofa) or on the visitor's own photo; drag,
  save/share. Never uploads the photo. Opens from work pages, Ask AI, or `#wall-view`.
- **Inquiry list** (save several works, one inquiry) — tested end to end (11/11).
- **Art fair page** `/fair/` + printable booth card `/fair/print/` (QR code verified to decode).
- **301 redirects** from every v1 address (incl. the designer's `/available.html`).
- **Recovered** the 9 images missing from the GitHub upload: 3 sharper work photos, 1 new work
  (`untitled-figurative-14`), an art-fair booth photo.
- **Accessibility**: axe-core WCAG 2.1 AA — 0 violations on all page types.
- **Fonts self-hosted** — no third-party requests at all.
- Speed on a throttled phone (slow 4G): Home main image 9.7 s → 0.8 s; Abstract fully loaded 55 s → 8.6 s.

### 2026-11-09 01:55–02:00 ET — session 2 (continued)
- Work pages: full-resolution **close-up** (tap to zoom across the surface), **Share**, and a one-page
  **spec sheet** when printed / saved as PDF.
- **Untitled works are now unambiguous**: "Untitled (Abstract 04)" in inquiries, page titles, the inquiry list and
  the assistant; every inquiry also records the page it came from.
- **Tests in the repo**: `npm test` (26 Playwright checks, desktop + phone, ~12 s). **CLAUDE.md** working notes.
- Content checklist now includes reviewing the assistant's answers and choosing featured works.

### 2026-11-09 02:00–02:05 ET — session 2 (continued)
- **Security headers**: strict Content-Security-Policy + X-Frame-Options; all scripts/styles are files. Every page and
  feature exercised under the policy in workerd — zero violations.
- Fixed: close-up button wasn't keyboard-focusable; header overflowed on 320px phones once the list had items
  (new regression test — 28 tests now).
- Checked layouts at iPad portrait/landscape, landscape phone, 1280×720 and 1920×1080 — no overflow.

## Morning summary for Isaac

**Where things stand.** The new site is on the `v2` branch of this repo, complete and working. `main` is untouched
and still matches the live site. Nothing has been deployed.

**See it without installing anything:** the visual tour at https://claude.ai/artifact/X4aVmg3vS3rNiop8ibPZVP
(private to you) — screenshots of every page and feature on desktop and phone, before/after numbers, and the list
of what's needed from you.

**Run it.** `npm install && npm run dev`, then open http://localhost:4321 — or deploy a private preview
(README › Deploying, step 1); the live site isn't affected until you move the domain.

**What only you can supply** — `docs/CONTENT-NEEDED.md` lists it: titles, sizes and years for most works,
prices (or keep "Price on request"), the About-page biography and exhibitions, approval of two drafted collection
descriptions, and the FAQ answers in `src/lib/faq.ts`.

**Decisions waiting on you** — `docs/V2-PLAN.md` › Decisions: show prices?; "Buy now" via Stripe?; AI on
(add an Anthropic API key) and which model; public email address.
