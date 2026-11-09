# Handoff — isaacandersonart.com V2

*Written 9 November 2026 after the overnight build; updated the same day after session 4 (preview on Cloudflare,
Astro 7, two phone fixes). For the next Claude session (and Isaac). Read this first, then `CLAUDE.md` (working
rules), then the top of `docs/PROGRESS.md`.*

---

## 1. Where things stand

The V2 site is **complete, tested and running on a private preview**:
**https://isaacandersonart-v2.bobdylan2000.workers.dev** (hidden from search engines). Cloudflare rebuilds it by
itself from the `v2` branch of **github.com/yitzhach/IA-ART-Claude-Code** on every push, in about 2–3 minutes.
`main` is the old v1 site (a Claude Design export) and still matches what's live on **isaacandersonart.com**,
which is untouched. Nothing has been merged to `main`, and no domain or DNS setting has changed.

What happens next depends on Isaac: he reviews the preview on his phone, supplies content and decisions (§7),
switches on Ask AI and the web editor (§7), then says when to go live (§8). Older visual tour:
https://claude.ai/artifact/X4aVmg3vS3rNiop8ibPZVP (private to him; the preview is now the better view).

**Who Isaac is:** a sculptor/painter (cement, plaster, steel; studios in Southern California and Southern Kentucky).
Not a developer. He wants a world-class site that leads to sales, is fast on phones (art-fair visitors), is easy for
him to update (prices, photos, new works), and has an "Ask AI" assistant. He values relentless quality, plain-language
explanations, and autonomy when he's away — but **never** deploy to the live domain, merge to `main`, or change
Cloudflare/DNS settings without his explicit go-ahead. (He approved creating the preview on 9 Nov.)

---

## 2. The live site today (don't break it)

- **isaacandersonart.com** and **www** are Workers Custom Domains on the Worker **`solitary-thunder-8ff9`** (static
  assets from the v1 Claude Design export, last updated 28 Sep 2026).
- Other subdomains run on separate Workers — **leave them alone**: `artlab` (art-lab), `digilight` (hidden-glade-be7a),
  `digilight-deck` (spring-darkness-380c), `invoice`, `hero` (broad-recipe-48a6), `flare` (crimson-art-4838),
  `batch` (sweet-scene-0d27). Isaac's studio platform (repo `Art-Talk-Back`: `studio-api`, `studio-assistant`, …)
  is separate too; this site doesn't use it.
- Zone settings seen 9 Nov (read-only): email **MX records point to IONOS** (don't touch them — Cloudflare Email
  Routing would replace that mail); **Always Use HTTPS is off**; **Web Analytics is already on** (auto-install
  since July 2026, so Cloudflare adds the beacon to every page — the CSP allows it).
- Source of v1: the Claude Design project, artifact **"5pm-8-18-NEW--ART-HOMEPAGE"**
  (claude.ai/artifact/CZSKb33Z1rrwD7WkDqArVe). Standalone Claude Design closes 14 Dec 2026; V2 replaces it.
- Forms post to Formspree endpoint **`xaqrglpk`** (unchanged from v1).

---

## 3. Stack

| Piece | Choice | Notes |
|---|---|---|
| Site | **Astro 7.4.7** (pinned), static output, Node **22.23.4+** | Upgraded from 5.18.2 on 9 Nov to clear all `npm audit` advisories (now 0). `compressHTML: true` keeps the classic whitespace handling. |
| Catalogue | Content collection, one folder per work | `src/content/works/<slug>/index.md` + photos; schema in `src/content.config.ts` (`z` from `astro/zod`, Zod 4) |
| Images | `sharp` 0.35.5 | 631 sizes per build; Astro caches them in `node_modules/.astro`. |
| Styling | Tokens in `src/styles/global.css`, scoped component styles | No inline styles (CSP). Fonts self-hosted via `@fontsource`. Minifier keeps the last of a prefixed/standard pair — prefixed first. |
| JS | Small vanilla scripts, heavy ones loaded on demand | `src/scripts/` (inquiry list, Ask AI, wall view) |
| Hosting | **Cloudflare Workers static assets** (`wrangler.jsonc`) | Worker `isaacandersonart-v2` (id `8c6c19ad15514dd1abba2a4b3e59013c`) runs only for `/api/*`. **Workers Builds** trigger "Preview from v2" (`9a5ea162-b2db-430c-a245-1d88148c3eb1`): `npm run build` then `npx wrangler deploy` on every push to `v2`. It reuses the account's "art-show-tracker build token"; a dedicated one can be made in Settings → Builds. |
| Ask AI backend | `worker/` + `@anthropic-ai/sdk` 1.6.0 | `claude-opus-5-5`, effort `low`, JSON-schema output, cached system prompt (~18k characters). Server-side refusal fallback (`fallbacks: "default"`) for Opus/Sonnet only — Haiku has none, so it isn't sent there. Model/effort in `wrangler.jsonc → vars`. Needs secret `ANTHROPIC_API_KEY` (not set yet). |
| Web editor | **Sveltia CMS 0.252.0** (pinned, from unpkg) at `/admin/` | GitHub token sign-in; saves to branch `v2` (switch to `main` after go-live). Config `public/admin/config.yml`. |
| Security | Strict CSP + headers in `public/_headers` | `/admin/*` has its own looser policy (unpkg, GitHub API, jsDelivr fonts). `X-Robots-Tag: noindex` on any `*.workers.dev` host. |
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
npm ci                  # install (Node 22.23.4+)
npm run dev             # http://localhost:4321
npm run check           # astro check + Worker tsc — must be 0 errors, 0 warnings, 0 hints
npm test                # astro build + Playwright on desktop & phone — 47 pass, 11 skipped (node-only and phone-only tests run once)
npm run content:report  # regenerate docs/CONTENT-NEEDED.md after editing works
npm run dev:worker      # build + wrangler dev (site + Worker in workerd, applies _headers)
npm run deploy          # build + wrangler deploy (needs `wrangler login`; normally unnecessary — pushing to v2 deploys the preview)
```

What the tests cover: every key page (title, one h1, share image, no overflow, alt text, no `[placeholder]` text, no
errors); works filter; inquiry list end to end (Formspree intercepted); Ask AI instant answers, colour search,
hand-off, a question sent while the assistant is still loading, and the fallback when it can't load; wall view;
320px header; phone menu focus and every menu link tappable; the editor config matching the schema; the Worker with
a fake Claude client (Opus and Haiku request shapes); and build scans (no inline scripts/styles, unique
view-transition names, no broken internal links).

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
- Commit and push to `v2` after every meaningful step (each push redeploys the preview). Plain-language summaries for Isaac.
- Verify visual changes on the preview from a real browser too (it's reachable from the sandbox) — two phone bugs
  were only visible there with animations on.

---

## 7. Waiting on Isaac

**Look at the preview on his phone** and say what he'd change.

**Switch-ons (his accounts, a few minutes each):**
1. **Ask AI:** Claude Console (platform.claude.com) → Settings → Workspaces → new workspace *Website* → its
   **Spend limits** (e.g. $20/month + alert) → create an API key in that workspace. Then Cloudflare → Workers &
   Pages → `isaacandersonart-v2` → Settings → Variables and Secrets → Add → Secret `ANTHROPIC_API_KEY` → Deploy.
   Then Claude tests a few questions on the preview. Model choice is his (README › Ask AI has per-question costs).
2. **Web editor:** fine-grained GitHub token (repo IA-ART-Claude-Code, Contents read/write), then sign in at
   https://isaacandersonart-v2.bobdylan2000.workers.dev/admin/ and make one real edit; the preview updates in ~3 min.

**Content** (full per-work list in `docs/CONTENT-NEEDED.md`):
1. Titles, sizes, years for the **37 untitled works**; medium for all works.
2. Prices for the 4 available works (or keep "Price on request"); real status for the 34 unconfirmed works.
3. About page: training/background (v1 had only placeholders), exhibitions, press.
4. Review the assistant's answers (`src/content/faq.yaml` / web editor) — add care, payment, shipping, show dates.
   (The shipping answer says work is delivered and installed in the U.S. and internationally — v1's wording; confirm.)
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
3. Ask AI model: `claude-opus-5-5` (default, best answers, ~1–4¢ a question), `claude-sonnet-5-5` (~1–2¢) or
   `claude-haiku-5-5` (~0.1¢). Only questions the instant FAQ can't answer reach Claude.
4. Public email: the site shows his Gmail. The domain's mail already runs through **IONOS** (MX records), so an
   `@isaacandersonart.com` address could be made there; Cloudflare Email Routing would replace the IONOS mail.
5. Formspree free plan = 50 submissions/month — upgrade if needed. (A preview test may fail if the form is
   restricted to his domain; that's expected.)
6. When to go live (§8).

---

## 8. Going live (only on Isaac's word, step by step)

Every step below is reversible; do them in order and check the site after each.

1. **Domains:** move `isaacandersonart.com` and `www.isaacandersonart.com` from `solitary-thunder-8ff9` to
   `isaacandersonart-v2` (dashboard: Workers & Pages → Worker → Settings → Domains; or the connector's
   `PUT /accounts/{id}/workers/domains` with `service: isaacandersonart-v2`). Then check both addresses, a v1 URL
   redirect (`/about.html`), the menu, a form and Ask AI on a phone. **Rollback:** point the two domains back at
   `solitary-thunder-8ff9` (it stays deployed, untouched).
2. **Branch:** make `main` match `v2` while keeping history (`git checkout v2 && git merge -s ours main`, push `v2`,
   then fast-forward `main` to `v2`) — `main` holds three image uploads of Isaac's that V2 already handles (PROGRESS,
   "Note — new upload on main"). Switch the build trigger's branch from `v2` to `main` (Settings → Builds, or
   `PATCH /builds/triggers/9a5ea162-b2db-430c-a245-1d88148c3eb1`), and set `branch: main` in `public/admin/config.yml`.
3. **Zone:** turn on **Always Use HTTPS** (SSL/TLS → Edge Certificates). Consider redirecting the bare domain to
   `www` (the canonical URLs use `www`) with a Redirect Rule.
4. **Search:** submit `https://www.isaacandersonart.com/sitemap.xml` in Google Search Console (the zone already has a
   Google verification record). Web Analytics is already on.

---

## 9. Not verified yet / known limitations

- **Never run against real services:** the web editor's sign-in and save (needs Isaac's token), and Ask AI's live
  Claude answers (needs a key). Both were exercised up to that point with stand-ins: the editor boots and parses its
  config; the Worker was tested in workerd against a mock Claude API and with a fake client in unit tests. On the
  preview, Ask AI without a key correctly hands off (503 `assistant_unavailable`, 403 from other origins).
- Verified on the real Cloudflare preview (9 Nov): every page type, CSP (no violations), redirects, 404, brotli,
  `noindex` on workers.dev, year-long caching of `/_astro/*`, the phone menu and the Ask AI fixes.
- Lighthouse (mobile, compressed like Cloudflare): Accessibility / Best Practices / SEO 100; Performance 100 on Works,
  ~79–88 on image-led pages under the slow-4G simulation. Not re-measured on Cloudflare. AVIF was tested and
  rejected (bigger than WebP on these textured surfaces).
- Older iPhones (before iOS 18) don't get the header's frosted blur: the minifier now emits only the standard
  `backdrop-filter`. Cosmetic only — the header keeps its 88% opaque background.
- Hardening to consider: the web editor loads Sveltia CMS from unpkg without an integrity hash. Self-hosting it from
  the npm package (or adding SRI) would remove that third-party dependency; test the editor afterwards.
- The empty `shows` collection prints a harmless "collection is empty" warning during builds.
- `/studio.html` (v1's private image tool) was dropped; its URL redirects home.

---

## 10. Notes for cloud sessions

- The sandbox reaches the preview (`*.workers.dev`), the npm registry, GitHub raw files and Google Fonts. It blocks
  `unpkg.com`, `cdn.jsdelivr.net`, `api.cloudflare.com`, `docs.astro.build` and `isaacandersonart.com`. To test the
  web editor locally, route `unpkg.com/@sveltia/cms@0.252.0/*` to the npm package's files.
- The **Cloudflare API connector** is signed in to Isaac's account. Use it to watch builds
  (`GET /accounts/{id}/builds/workers/8c6c19ad15514dd1abba2a4b3e59013c/builds`, then `/builds/builds/{uuid}/logs`)
  and for read-only checks. Anything that changes the live domain, DNS or zone settings needs Isaac's go-ahead.
- Astro 7 backgrounds `astro preview`/`astro dev` when an AI agent runs them; pass `--ignore-lock` for a foreground
  server, and `npx astro preview stop` to end a background one.
- The clone may track only `main`. If `git status` shows no upstream for `v2`:
  `git config --add remote.origin.fetch '+refs/heads/v2:refs/remotes/origin/v2' && git fetch origin && git branch -u origin/v2`.
  Web editor saves commit to `v2` too — pull before working.
- GitHub prints "This repository moved" on push (case change in the repo name) — harmless.
- Playwright: `@playwright/test` is pinned to 1.63.0 to match the preinstalled browser; don't run `playwright install`
  in the cloud sandbox.
- To test Ask AI end to end without a key: run a tiny mock of `POST /v1/messages` and start
  `wrangler dev --var ANTHROPIC_API_KEY:test --var ANTHROPIC_BASE_URL:http://127.0.0.1:<port>`.
