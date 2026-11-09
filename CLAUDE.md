# isaacandersonart.com — working notes for Claude

Isaac Anderson's portfolio and sales site (sculptural art in cement, plaster and steel). Astro 5 static
site + one Cloudflare Worker for the Ask AI endpoint. Isaac is not a developer: explain changes in plain
language and keep everyday edits (prices, new works) possible without code. README.md has the full tour.

## Commands

```bash
npm run dev             # http://localhost:4321
npm run check           # astro check + Worker type-check — must be clean
npm test                # build + Playwright (desktop & phone) — must pass
npm run content:report  # regenerate docs/CONTENT-NEEDED.md after touching works
npm run dev:worker      # site + Worker in workerd (Ask AI needs --var ANTHROPIC_API_KEY:…)
```

Run `npm run check && npm test` before every commit that changes code.

## Where things live

- Catalogue: `src/content/works/<slug>/index.md` + images; schema and field docs in `src/content.config.ts`.
  Sizes are **width × height in inches**. Folder name = URL.
- Contact details, nav, collection blurbs: `src/lib/site.ts`. Assistant FAQ: `src/lib/faq.ts`.
- Design tokens: top of `src/styles/global.css`. Components use tokens; no inline styles.
- Browser scripts: `src/scripts/` (inquiry list, Ask AI, wall view). Worker: `worker/`.
- Plans and status: `docs/V2-PLAN.md`, `docs/PROGRESS.md`, `docs/CONTENT-NEEDED.md`, `docs/AUDIT.md`.

## Rules

- **Never invent facts.** Titles, sizes, years, prices, biography, exhibitions, shipping or care policies come
  from Isaac only. If something is unknown, leave the field out and let `content:report` list it.
- **No placeholder ever renders.** Missing data is omitted, not shown as "[Title]" — the tests enforce this.
- The FAQ and the AI system prompt may only state what is true for the studio; unknowns hand off to Isaac.
- Keep pages static and light: JavaScript only where interaction needs it, heavy features loaded on demand.
- Keep it accessible: one `<h1>` per page, alt text on every image, 44px tap targets, reduced motion respected,
  axe-core clean.
- Images: put originals in the work folder; Astro makes the web sizes. Don't commit near-duplicate files.
- `public/_headers` sends a strict Content-Security-Policy (self + Formspree + Cloudflare Web Analytics). Adding any
  third-party script, style, font, image or API means updating it — test under `npm run dev:worker`, which applies
  the headers (`npm test` uses `astro preview`, which doesn't). Astro is set never to inline CSS/JS for this reason.
- Ask AI defaults to `claude-opus-5-5` (`wrangler.jsonc → vars`); the API key is a Worker secret, never in the repo.
- Never deploy, change DNS, or move the custom domain without Isaac's go-ahead. Work on a branch; `main` is
  the live v1 site until Isaac merges V2.
