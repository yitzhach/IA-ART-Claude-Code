import { test, expect } from '@playwright/test';

const pages = ['/', '/works/', '/works/green-horizon/', '/collections/figurative/', '/commissions/', '/process/', '/about/', '/inquire/', '/fair/'];

for (const path of pages) {
  test(`${path} renders cleanly`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
    await page.goto(path, { waitUntil: 'networkidle' });

    await expect(page).toHaveTitle(/Isaac Anderson/);
    await expect(page.locator('h1')).toHaveCount(1);
    expect(await page.locator('meta[name="description"]').getAttribute('content')).toBeTruthy();
    expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toMatch(/^https:\/\//);

    const report = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      return {
        overflow: [...document.querySelectorAll('body *')].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== 'fixed';
        }).length,
        noAlt: [...document.images].filter((i) => !i.hasAttribute('alt')).length,
        placeholders: document.body.innerText.match(/\[[A-Z][^\]]{2,40}\]/g) ?? [],
      };
    });
    expect(report.overflow, 'nothing wider than the screen').toBe(0);
    expect(report.noAlt, 'every image has alt text').toBe(0);
    expect(report.placeholders, 'no [placeholder] text').toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('works filter shows only available works', async ({ page }) => {
  await page.goto('/works/?status=available');
  const visible = page.locator('[data-grid] > [data-status]:visible');
  await expect(visible.first()).toBeVisible();
  for (const status of await visible.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.status))) {
    expect(status).toBe('available');
  }
});

test('phone menu moves focus in, and Escape returns it', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone layout only');
  await page.goto('/');
  await page.click('[data-menu-btn]');
  await expect(page.locator('#menu a').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toBeHidden();
  await expect(page.locator('[data-menu-btn]')).toBeFocused();
});

// The header's frosted blur once trapped the fixed menu inside the header bar: only the first link
// showed and taps went to the page behind. Every link must be on top where a finger would land.
test('phone menu covers the page and every link can be tapped', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone layout only');
  for (const path of ['/', '/works/']) {
    await page.goto(path);
    await page.click('[data-menu-btn]');
    const links = page.locator('#menu a');
    await expect(links.first()).toBeVisible();
    for (const link of await links.all()) {
      const onTop = await link.evaluate((a) => {
        const r = a.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return r.bottom <= innerHeight && !!hit && (a === hit || a.contains(hit));
      });
      expect(onTop, `${await link.innerText()} on ${path}`).toBe(true);
    }
  }
});
