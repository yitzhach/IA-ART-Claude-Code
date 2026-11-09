import { test, expect } from '@playwright/test';

test('Ask AI answers FAQ instantly and hands off when AI is unavailable', async ({ page }) => {
  await page.route('**/api/ask', (r) => r.fulfill({ status: 503, body: '{"error":"assistant_unavailable"}' }));
  await page.goto('/');
  await page.click('[data-ask-open]');
  await page.locator('.ask .chip', { hasText: 'commission work' }).click();
  await expect(page.locator('.ask .msg--bot').last()).toContainText('Consultation');

  await page.fill('[data-ask-input]', 'Could you make a matching pair for twin beds?');
  await page.press('[data-ask-input]', 'Enter');
  const handoff = page.locator('.ask .msg-action', { hasText: 'Send this question' });
  await expect(handoff).toBeVisible();
  await handoff.click();
  await expect(page.locator('textarea[name=message]').first()).toHaveValue(/matching pair/);
});

test('View on your wall draws the work at true scale', async ({ page }) => {
  await page.goto('/works/new-horizon/#wall-view');
  await expect(page.locator('[data-wall][open]')).toBeVisible();
  await expect(page.locator('[data-wall-hint]')).toContainText('48 × 48 in');
});
