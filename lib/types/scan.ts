import { chromium } from 'playwright';
import { runAxeScan } from '../accessibility/axe-runner';
import type { AxeResults } from 'axe-core';

export interface NormalizedViolation {
  id: string;
  impact: string | null | undefined;
  description: string;
  helpUrl: string;
  affectedNodes: number;
  htmlSnippets: string[];
}

export interface NormalizedScanResult {
  url: string;
  timestamp: string;
  totalViolations: number;
  violations: NormalizedViolation[];
}

/**
 * Transforms raw Axe-core output into a simplified schema.
 */
function normalizeResults(rawResults: AxeResults): NormalizedViolation[] {
  return rawResults.violations.map(violation => ({
    id: violation.id,
    impact: violation.impact,
    description: violation.description,
    helpUrl: violation.helpUrl,
    affectedNodes: violation.nodes.length,
    htmlSnippets: violation.nodes.map(node => node.html)
  }));
}

/**
 * Orchestrates the full scan process: Browser Setup -> Scan -> Normalization
 */
export async function performFullScan(url: string): Promise<NormalizedScanResult> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Start scanning once the document is loaded. Some sites keep analytics
    // or other background requests open indefinitely, so networkidle can hang.
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // 1. Delegate the actual scanning to axe-runner
    const rawResults = await runAxeScan(page);

    // 2. Normalize the raw data
    const normalizedViolations = normalizeResults(rawResults);

    // 3. Return the standardized output
    return {
      url: rawResults.url,
      timestamp: rawResults.timestamp,
      totalViolations: normalizedViolations.length,
      violations: normalizedViolations
    };
    
  } finally {
    await context.close();
    await browser.close();
  }
}
