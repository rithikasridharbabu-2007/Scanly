import AxeBuilder from '@axe-core/playwright';
import type { Page } from 'playwright';
import type { AxeResults } from 'axe-core';

/**
 * Executes the Axe accessibility scan on a given Playwright page.
 */
export async function runAxeScan(page: Page): Promise<AxeResults> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
    
  return results;
}