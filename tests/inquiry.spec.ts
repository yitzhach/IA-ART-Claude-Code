import { test, expect } from '@playwright/test';

test('shortlist two works and send one inquiry', async ({ page }) => {
  let posted = '';
  await page.route('https://formspree.io/**', async (route) => {
    posted = route.request().postData() ?? '';
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  await page.goto('/works/green-horizon/');
  await page.click('[data-add-to-list]');
  await expect(page.locator('[data-list-count]')).toHaveText('1');
  await page.goto('/works/lifted-up/');
  await page.click('[data-add-to-list]');
  await expect(page.locator('[data-list-count]')).toHaveText('2');

  await page.goto('/inquire/');
  await expect(page.locator('[data-items] li')).toHaveCount(2);
  await page.fill('input[name=name]', 'Test Person');
  await page.fill('input[name=email]', 'test@example.com');
  await page.fill('textarea[name=message]', 'Testing.');
  await page.click('form [type=submit]');
  await expect(page.locator('[data-status][data-ok]')).toContainText('Thank you');
  expect(posted).toContain('Green Horizon');
  expect(posted).toContain('Lifted Up');
  await expect(page.locator('[data-inquiry-list]')).toBeHidden();
});
