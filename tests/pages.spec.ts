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
