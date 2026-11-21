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

async function checkKeyboardFlow(page: Page, viewport: Viewport, browserName: string) {
  // Safari tabs through text fields unless Option is held. Playwright sends that as Alt.
  const nextControl = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  const previousControl = browserName === 'webkit' ? 'Alt+Shift+Tab' : 'Shift+Tab';
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto('/');
  await expect(page).toHaveTitle('Scanly');
  await expect(page.getByRole('heading', { level: 1, name: 'Scanly' })).toBeVisible();

  const input = page.getByLabel('Website URL');
  const submit = page.getByRole('button', { name: 'Scan website' });
  const form = page.locator('form');
  const heading = page.getByRole('heading', { level: 2 });

  await expect(input).toBeVisible();
  await expect(submit).toBeVisible();
  await expectInsideViewport(input, viewport.width);
  await expectInsideViewport(submit, viewport.width);
  await expectInsideViewport(heading, viewport.width);

  const inputAtRest = await paint(input);
  const submitAtRest = await paint(submit);

  await page.locator('body').click({ position: { x: 8, y: 8 } });
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  expect(await paint(input)).not.toEqual(inputAtRest);

  await page.keyboard.press(nextControl);
  await expect(submit).toBeFocused();
  expect(await paint(submit)).not.toEqual(submitAtRest);

  await page.keyboard.press('Enter');
  const validationError = form.getByRole('alert');
  await expect(validationError).toContainText('valid website URL');
  await expect(input).toHaveAttribute('aria-invalid', 'true');

  await page.keyboard.press(previousControl);
  await expect(input).toBeFocused();
  await page.keyboard.type('https://example.com');
  await page.keyboard.press(nextControl);
  await expect(submit).toBeFocused();
  await page.keyboard.press('Enter');

  const loading = page.getByRole('status');
  await expect(loading).toContainText('Scanning');
  await expectInsideViewport(loading, viewport.width);

  const report = page.getByRole('region', { name: 'Accessibility report' });
  await expect(report).toBeVisible();
  await expectInsideViewport(report, viewport.width);
}

for (const viewport of viewports) {
  test(`keyboard user can submit the URL form on ${viewport.name}`, async ({ page, browserName }) => {
    await checkKeyboardFlow(page, viewport, browserName);
  });
}
