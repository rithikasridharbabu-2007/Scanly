import { expect, test, type Locator, type Page } from '@playwright/test';

type Viewport = { name: string; width: number; height: number };

const viewports: Viewport[] = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'phone', width: 390, height: 844 },
];

async function paint(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
      borderColor: style.borderTopColor,
      boxShadow: style.boxShadow,
    };
  });
}

async function expectInsideViewport(locator: Locator, width: number) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
}

async function checkKeyboardFlow(page: Page, viewport: Viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto('/');
  await expect(page).toHaveTitle('Scanly');
  await expect(page.getByRole('heading', { level: 1, name: 'Scanly' })).toBeVisible();

  const input = page.getByLabel('Website URL');
  const submit = page.getByRole('button', { name: 'Scan website' });
  const form = page.locator('form');

  await expect(input).toBeVisible();
  await expect(submit).toBeVisible();
  await expectInsideViewport(input, viewport.width);
  await expectInsideViewport(submit, viewport.width);

  const inputAtRest = await paint(input);
  const submitAtRest = await paint(submit);

  // Give the page focus, then move with the keyboard only.
  await page.locator('body').click({ position: { x: 8, y: 8 } });
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  expect(await paint(input)).not.toEqual(inputAtRest);

  await page.keyboard.press('Tab');
  await expect(submit).toBeFocused();
  expect(await paint(submit)).not.toEqual(submitAtRest);

  await page.keyboard.press('Enter');
  await expect(form.getByRole('alert')).toContainText('valid website URL');

  await input.fill('https://example.com');
  await page.keyboard.press('Tab');
  await expect(submit).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Scanning');

  const report = page.getByRole('region', { name: 'Accessibility report' });
  await expect(report).toBeVisible();
  await expectInsideViewport(report, viewport.width);
}

for (const viewport of viewports) {
  test(`keyboard user can submit the URL form on ${viewport.name}`, async ({ page }) => {
    await checkKeyboardFlow(page, viewport);
  });
}
