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
