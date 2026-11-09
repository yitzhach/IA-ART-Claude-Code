# Progress log

Working branch: **`v2`**. `main` is untouched and still matches the live site.
Nothing is deployed to Cloudflare — Isaac deploys.

## Morning summary for Isaac — Monday 9 November

### What's done
The new site is complete and working on the `v2` branch, built from your Claude Design export but rewritten as a
clean, fast Astro site in the same look and voice.

- **46 works, one catalogue** (v1 had 84 numbered slots with the same piece filed up to four times). Every work has
  its own shareable page with size (in and cm), status, price or "Price on request", close-up zoom, a one-page
  spec sheet when printed, **View on your wall** (true scale, sample room or their own photo), and an inquiry form
  that asks whether they want to buy, hold it for a client, or see it in person.
- **Selling tools:** inquiry list (shortlist several works, send one inquiry), **Ask AI** on every page (instant
  answers, finds works by collection, size or colour; Claude answers the rest once you add an API key), a phone-first
  **art-fair page** with a printable QR booth card, and a commission form.
- **Fixed from v1:** the inquiry form running off phone screens, ~85 visible placeholders, pages without titles or
  link previews, sold works marked "Available", the hero overlapping on phones.
- **Speed and quality:** home page main image 9.7 s → 0.8 s on a slow phone connection; Lighthouse 100 for
  accessibility, best practices and SEO; zero accessibility violations; strict security headers; 41 automated checks.
- **Easy to change:** a web editor at `/admin/` (prices, status, photos, new works, the assistant's answers, shows),
  usable from your phone. Every old link (`/about.html`, the designer's `/available.html`…) redirects to its new page.

### See it
- **Without installing anything:** the visual tour, https://claude.ai/artifact/X4aVmg3vS3rNiop8ibPZVP
- **On your computer:** install Node 20+, then in the repo folder run `npm install` and `npm run dev`, and open
  http://localhost:4321
- **On Cloudflare, privately:** `npx wrangler login`, then `npm run deploy` — it publishes to a separate preview
  address (`isaacandersonart-v2…workers.dev`); your live site isn't touched. README › Deploying has the rest.

### What only you can supply (full list in `docs/CONTENT-NEEDED.md`)
1. Titles, sizes and years for the 37 untitled works (they show as "Untitled (Abstract 04)" etc. until then).
2. Prices for available works — or keep "Price on request". Status for works marked "Availability on request".
3. Your training and background for the About page, plus exhibitions and press.
4. A read of the assistant's answers (web editor → Assistant answers): add care, payment, shipping, show dates.
5. Approve the two collection descriptions Claude drafted (Figurative, Sculptural) and the per-work descriptions.
6. Up to 8 works to feature on the home page; upcoming shows (your Show Ledger has the 2027 Florida season).
7. Whether `untitled-abstract-04` and `untitled-sculptural-09` are the same piece; a straight-on photo of Lifted Up.

### Decisions waiting on you
1. Show prices on the site, or "Price on request"?
2. "Buy now" through Stripe Payment Links, a deposit to reserve, or inquiry only?
3. Switch on AI answers? Needs an Anthropic API key (`npx wrangler secret put ANTHROPIC_API_KEY`) and a monthly
   spend limit. Default model is `claude-opus-5-5`; `claude-haiku-5-5` costs about 1/40th as much.
4. Keep the Gmail address public, or set up studio@isaacandersonart.com (free with Cloudflare Email Routing)?
5. Formspree's free plan allows 50 messages a month — upgrade if inquiries outgrow it.

### Going live, when you're ready
Preview first (above) → in Cloudflare, move isaacandersonart.com and www from the old Worker
(`solitary-thunder-8ff9`) to `isaacandersonart-v2` → merge `v2` into `main` → switch the web editor's branch to
`main` (`public/admin/config.yml`) → turn on Web Analytics. The old Worker stays as an instant rollback.

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
- **Tests in the repo**: `npm test` (Playwright, desktop + phone, ~12 s). **CLAUDE.md** working notes.
- Content checklist now includes reviewing the assistant's answers and choosing featured works.

### 2026-11-09 02:00–02:05 ET — session 2 (continued)
- **Security headers**: strict Content-Security-Policy + X-Frame-Options; all scripts/styles are files. Every page and
  feature exercised under the policy in workerd — zero violations.
- Fixed: close-up button wasn't keyboard-focusable; header overflowed on 320px phones once the list had items
  (new regression test — 28 tests now).
- Checked layouts at iPad portrait/landscape, landscape phone, 1280×720 and 1920×1080 — no overflow.

### 2026-11-09 02:05–02:12 ET — session 2 (continued)
- **Visual tour** for Isaac published (private): https://claude.ai/artifact/X4aVmg3vS3rNiop8ibPZVP
- **Every work described** from its photo (`alt:` — palette, composition, surface): better alt text, better Google
  Images, and Ask AI can now find pieces by colour or motif ("anything blue?", "a piece with a tree").
- FAQ answers also list matching works when the question names them.
- Found and merged one more duplicate (`untitled-abstract-06` = Green Horizon) — **46 works**. Flagged a possible
  duplicate (`untitled-abstract-04` / `untitled-sculptural-09`) for Isaac.
- 30 tests pass.

### 2026-11-09 02:12–02:20 ET — session 2 (continued)
- **Lighthouse (mobile)**, served compressed like Cloudflare: Accessibility 100, Best Practices 100, SEO 100 on every
  page tested; Performance 100 on Works, 79–88 on image-led pages under the slow-4G simulation (first paint 0.9 s).
- Image delivery: 240/320/800px renditions, tighter card `sizes`, per-work `sizes` on artwork pages. AVIF measured
  and rejected (larger than WebP on these textured surfaces, 20× slower to build).
- Works whose status Isaac hasn't confirmed now say "Availability on request" instead of implying they're for sale.

### 2026-11-09 02:20–02:26 ET — session 2 (continued)
- **Web editor** at `/admin/` (Sveltia CMS 0.252.0, pinned): edit prices, status, photos, order and add works from a
  phone; saves commit to GitHub. Sign-in with a fine-grained GitHub token (README › The web editor). Booted under its
  own CSP in workerd with zero violations; a test keeps its fields in step with the catalogue schema.
- Fair page shows three show photos; removed unused code/images.

### 2026-11-09 02:26–02:30 ET — session 2 (continued)
- **FAQ moved to `src/content/faq.yaml`** (a typed content collection) so it's editable in the web editor
  (**Assistant answers**) as well as on GitHub. Rewrote the editor config in block YAML (a comma inside an inline
  label had been splitting it into extra options). Editor boots clean; all tests pass.

### 2026-11-09 02:30–02:33 ET — session 2 (continued)
- **Shows & exhibitions** (`src/content/shows.yaml`, editable in the web editor → Shows): upcoming shows appear on
  `/fair/` and About; past ones become "Selected exhibitions" on About. Empty for now, so nothing renders until Isaac
  adds real entries (his Show Ledger artifact has the 2027 Florida season — copy on request). Dates format correctly
  across months and years (tested with sample data, then removed).

### 2026-11-09 02:33–02:36 ET — session 2 (continued)
- Home shows a "Next show" line and collection pages link to their available works — both only when relevant.
- **Worker unit tests** (`tests/worker.spec.ts`): input limits, byte-identical cached prompt, request shape
  (model, effort, JSON schema, fallbacks, cache marker), reply filtering and hand-off on refusal/truncation/bad JSON.
  37 tests pass.

### 2026-11-09 02:35–02:38 ET — session 2 (continued, via the 1:22 restart)
- Work-page forms ask what the visitor wants (question / buy / hold for a client / see in person).
- "More like this" ranks related works by shared palette and motifs.
- Breadcrumb structured data on work pages. Plan Phase 6 added; remaining items need Isaac's content or go-live.

- **Page transitions** (cross-document View Transitions, no JS): pages crossfade and a card's artwork glides into
  the work page. Names come from a generated `/transitions.css` (inline styles are blocked by the CSP); checked for
  duplicate names on every page; off for reduced-motion users; other browsers navigate normally.

- **Build checks** (`tests/build.spec.ts`): no inline scripts/styles (CSP-safe), unique transition names, no broken
  internal links. Refactor: structured data → `src/lib/structured-data.ts`, print styles → `src/styles/spec-sheet.css`.
  41 tests pass.

### 2026-11-09 06:25 ET — session 3 (the 6:25 restart)
- Fresh visual pass over every page (desktop + phone): no overflow, broken images, placeholders or errors.
- Home page now leads with all 4 available works (was 2 available beside 6 sold).
- The close-up viewer's image is created on first open (no empty `<img>` in the page).
- Morning summary rewritten and moved to the top of this file.

### Note — new upload on `main`
Isaac uploaded three images to `main` overnight (`images/library/8-jbpg-3000.webp`, `final-6003512.webp`,
`img-6658.webp`). All three were already recovered from the Claude Design project and handled on `v2`: `img-6658`
is the catalogue work `untitled-figurative-14`; `8-jbpg-3000` duplicates the second photo of `untitled-figurative-13`;
`final-6003512` is a room photo (unused). `main` itself is left untouched.
