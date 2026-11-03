import { expect, test } from '@playwright/test';
import { runAxeScan } from '../lib/accessibility/axe-runner';
import { explainFinding, explainScannerResult, listCoveredRules } from '../lib/accessibility/rule-catalog';

test('URL validation, sample report, and another submission', async ({ page }) => {
  await page.goto('/');
  const input = page.getByLabel('Website URL');
  const submit = page.getByRole('button', { name: 'Scan website' });
  const validationError = page.locator('form').getByRole('alert');
  await submit.click();
  await expect(validationError).toContainText('valid website URL');
  await input.fill('not-a-url');
  await submit.click();
  await expect(validationError).toBeVisible();
  await input.fill('https://example.com');
  await submit.click();
  await expect(page.getByRole('status')).toContainText('Scanning');
  await expect(page.getByRole('heading', { name: 'Accessibility report' })).toBeVisible();
  await expect(page.getByText('Sample results for', { exact: false })).toContainText('https://example.com');
  await expect(page.getByRole('article')).toHaveCount(5);
  await input.fill('https://www.w3.org');
  await submit.click();
  await expect(page.getByText('Sample results for', { exact: false })).toContainText('https://www.w3.org');
});

test('combined app exposes backend routes and validates scan requests', async ({ request }) => {
  expect((await request.get('/api/health')).status()).toBe(200);
  const rules = await request.get('/api/rules?ruleId=image-alt');
  expect(rules.status()).toBe(200);
  expect((await rules.json()).ruleId).toBe('image-alt');
  expect((await request.get('/api/rules?ruleId=unknown-rule')).status()).toBe(404);
  for (const data of [{}, { url: 'invalid' }, { url: 'file:///etc/passwd' }]) {
    expect((await request.post('/api/scans', { data })).status()).toBe(400);
  }
  expect((await request.get('/api/scans')).status()).toBe(400);
  expect((await request.post('/api/scans', { data: 'null', headers: { 'Content-Type': 'application/json' } })).status()).toBe(400);
  expect((await request.get('/api/scans?scanId=unknown')).status()).toBe(404);
});

test('scanner findings receive catalog guidance without changing engine facts', async ({ page }) => {
  await page.setContent('<!doctype html><html lang="en"><head><title>Scanner fixture</title></head><body><main><h1>Test</h1><img src="data:image/png;base64,AA=="><button></button><input type="text"></main></body></html>');
  const raw = await runAxeScan(page);
  expect(raw.violations.map(v => v.id)).toEqual(expect.arrayContaining(['image-alt', 'button-name', 'label']));
  const result = explainScannerResult({
    url: raw.url, timestamp: raw.timestamp, totalViolations: raw.violations.length,
    violations: raw.violations.map(v => ({
      id: v.id, impact: v.impact, description: v.description, helpUrl: v.helpUrl,
      tags: v.tags, htmlSnippets: v.nodes.map(node => node.html),
    })),
  });
  for (const finding of result.violations) {
    const original = raw.violations.find(v => v.id === finding.ruleId)!;
    expect(finding.impact).toBe(original.impact);
    expect(finding.helpUrl).toBe(original.helpUrl);
    expect(finding.wcagTags).toEqual(original.tags);
    expect(finding.explanation.suggestedFix).toBeTruthy();
  }
  expect(listCoveredRules()).toHaveLength(8);
});

test('unknown rules and incomplete findings remain honest fallbacks', () => {
  const finding = {
    ruleId: 'unknown-rule', impact: 'serious' as const, title: 'Engine title',
    description: 'Engine description', helpUrl: 'https://example.com/rule',
    wcagTags: ['wcag2a'], affectedElements: [],
  };
  const unknown = explainFinding(finding);
  expect(unknown.explanation.reviewStatus).toBe('fallback');
  expect(unknown.explanation.plainLanguageSummary).toBe(finding.description);
  const incomplete = explainFinding({ ...finding, ruleId: 'color-contrast' }, 'needs_review');
  expect(incomplete.resultType).toBe('needs_review');
  expect(incomplete.explanation.manualCheckNeeded).toBe(true);
  expect(incomplete.explanation.reviewStatus).toBe('pending_review');
  expect(incomplete.explanation.plainLanguageSummary).toContain("couldn't measure");
});
