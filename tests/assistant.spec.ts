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

// The assistant's code loads only when the panel opens. On a slow phone a visitor can send a question
// before it arrives; it must wait for the code, not reload the page and lose the question.
const askChunk = (url: URL) => /\/_astro\/ask\.[\w-]+\.js$/.test(url.pathname);

test('a question sent while Ask AI is still loading waits for it', async ({ page }) => {
  await page.route('**/api/ask', (r) => r.fulfill({ status: 503, body: '{}' }));
  await page.route(askChunk, async (r) => {
    await new Promise((done) => setTimeout(done, 1500));
    await r.continue();
  });
  await page.goto('/');
  await page.click('[data-ask-open]');
  await page.fill('[data-ask-input]', 'Could you make a matching pair for twin beds?');
  await page.press('[data-ask-input]', 'Enter');
  await expect(page.locator('.ask .msg-action', { hasText: 'Send this question' })).toBeVisible();
  await expect(page.locator('.ask .msg--user').last()).toContainText('matching pair');
  expect(new URL(page.url()).search).toBe('');
});

test('if Ask AI cannot load, the question goes to the inquiry form', async ({ page }) => {
  await page.route(askChunk, (r) => r.abort());
  await page.goto('/');
  await page.click('[data-ask-open]');
  await page.fill('[data-ask-input]', 'Could you make a matching pair for twin beds?');
  await page.press('[data-ask-input]', 'Enter');
  await expect(page).toHaveURL(/\/inquire\/\?q=/);
  await expect(page.locator('textarea[name=message]').first()).toHaveValue(/matching pair/);
});

test('View on your wall draws the work at true scale', async ({ page }) => {
  await page.goto('/works/new-horizon/#wall-view');
  await expect(page.locator('[data-wall][open]')).toBeVisible();
  await expect(page.locator('[data-wall-hint]')).toContainText('48 × 48 in');
});

test('Ask AI finds works by colour and still answers the question', async ({ page }) => {
  await page.route('**/api/ask', (r) => r.fulfill({ status: 503, body: '{}' }));
  await page.goto('/');
  await page.click('[data-ask-open]');
  await page.fill('[data-ask-input]', 'Do you have anything blue?');
  await page.press('[data-ask-input]', 'Enter');
  await expect(page.locator('.ask .msg--bot').last()).toContainText('that fit');
  expect(await page.locator('.ask .msg--bot').last().locator('.msg-works li').count()).toBeGreaterThan(0);

  await page.fill('[data-ask-input]', 'How much is a large white piece?');
  await page.press('[data-ask-input]', 'Enter');
  const last = page.locator('.ask .msg--bot').last();
  await expect(last).toContainText('priced individually');
  expect(await last.locator('.msg-works li').count()).toBeGreaterThan(0);
});
