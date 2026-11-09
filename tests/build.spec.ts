import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Static checks over the built site (dist/). `npm test` serves pages without the production headers,
// so these catch what the Content-Security-Policy would block, plus broken internal links.
const DIST = 'dist';
const pages = (dir = DIST): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? pages(p) : p.endsWith('.html') ? [p] : [];
  });

test.describe('built site', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'runs once'));

  test('no inline scripts or styles (the CSP would block them)', () => {
    const offenders: string[] = [];
    for (const file of pages()) {
      const html = readFileSync(file, 'utf8');
      for (const [, attrs, body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
        if (body.trim() && !attrs.includes('application/ld+json')) offenders.push(`${file}: inline <script>`);
      }
      if (/<style[\s>]/.test(html)) offenders.push(`${file}: <style> block`);
      if (/\sstyle="/.test(html)) offenders.push(`${file}: style="" attribute`);
    }
    expect(offenders).toEqual([]);
  });

  test('no page repeats a view-transition name', () => {
    for (const file of pages()) {
      const names = [...readFileSync(file, 'utf8').matchAll(/data-vt="([^"]+)"/g)].map((m) => m[1]);
      expect(names.length, file).toBe(new Set(names).size);
    }
  });

  test('every internal link points at a page or file that exists', () => {
    const redirects = readFileSync(join(DIST, '_redirects'), 'utf8')
      .split('\n')
      .filter((l) => l.startsWith('/'))
      .map((l) => l.split(/\s+/)[0]);
    const broken = new Set<string>();
    for (const file of pages()) {
      for (const [, href] of readFileSync(file, 'utf8').matchAll(/href="(\/[^"#?]*)/g)) {
        if (href.startsWith('/api/') || redirects.includes(href)) continue;
        const target = join(DIST, href);
        const ok = existsSync(target) && (statSync(target).isFile() || existsSync(join(target, 'index.html')));
        if (!ok) broken.add(`${href} (from ${file})`);
      }
    }
    expect([...broken]).toEqual([]);
  });
});
