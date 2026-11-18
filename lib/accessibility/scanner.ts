import { chromium, type Browser } from 'playwright';
import { LIMITS, ScanError } from '../security/limits';
import { parseScanUrl, resolvePublicUrl } from '../security/url-policy';
import { startScanProxy } from '../security/scan-proxy';
import { runAxeScan } from './axe-runner';
import { scanFailure, type ScanStage } from './scan-errors';
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
  manualReviewFindings: NormalizedViolation[];
}

/**
 * Transforms raw Axe-core output into a simplified schema.
 */
function normalizeResults(findings: AxeResults['violations']): NormalizedViolation[] {
  return findings.map(violation => ({
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
export async function performFullScan(url: string, signal?: AbortSignal): Promise<NormalizedScanResult> {
  let browser: Browser | undefined;
  let proxy: Awaited<ReturnType<typeof startScanProxy>> | undefined;
  let failure: ScanError | undefined;
  let stage: ScanStage = 'setup';
  const stop = (error: ScanError) => {
    failure ??= error;
    void browser?.close().catch(() => {});
  };
  const aborted = () => stop(new ScanError('SCAN_CANCELLED', 'The scan was cancelled'));
  const deadline = setTimeout(() => stop(new ScanError('SCAN_TIMEOUT', 'Scan exceeded the 90-second deadline')), LIMITS.scanMs);
  signal?.addEventListener('abort', aborted, { once: true });
  const check = () => {
    if (signal?.aborted) aborted();
    if (failure) throw failure;
  };
  try {
    check();
    await resolvePublicUrl(url);
    check();
    proxy = await startScanProxy(stop);
    stage = 'browser';
    browser = await chromium.launch({
      headless: true, chromiumSandbox: true, timeout: LIMITS.navigationMs,
      proxy: { server: proxy.server, bypass: '<-loopback>' },
      args: ['--disable-quic', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        '--disable-background-networking', '--disable-extensions'],
    });
    check();
    stage = 'setup';
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false });
    context.setDefaultTimeout(LIMITS.navigationMs);
    context.setDefaultNavigationTimeout(LIMITS.navigationMs);
    let requests = 0;
    await context.route('**/*', async route => {
      try {
        check();
        if (++requests > LIMITS.requests) throw new ScanError('RESOURCE_LIMIT', 'Scan exceeded the 250-request limit');
        parseScanUrl(route.request().url());
        let hops = 0;
        for (let previous = route.request().redirectedFrom(); previous; previous = previous.redirectedFrom()) {
          if (++hops > LIMITS.redirects) throw new ScanError('RESOURCE_LIMIT', 'Scan exceeded the redirect limit');
        }
        await route.continue();
      } catch (error) {
        if (error instanceof ScanError) stop(error);
        await route.abort().catch(() => {});
      }
    });
    await context.routeWebSocket('**/*', socket => socket.close());
    context.on('page', () => {
      // Axe opens one about:blank helper page to merge frame results.
      if (context.pages().length > 2) stop(new ScanError('RESOURCE_LIMIT', 'Scan exceeded the page limit'));
    });
    const page = await context.newPage();
    page.on('popup', () => stop(new ScanError('RESOURCE_LIMIT', 'Pop-up pages are not allowed during scans')));
    page.on('download', download => {
      void download.cancel().catch(() => {});
      stop(new ScanError('RESOURCE_LIMIT', 'Downloads are not allowed during scans'));
    });
    stage = 'navigation';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: LIMITS.navigationMs });
    stage = 'analysis';
    let nodeCount = 0;
    for (const frame of page.frames()) {
      nodeCount += await frame.locator('*').count();
      if (nodeCount > LIMITS.documentNodes) throw new ScanError('RESOURCE_LIMIT', 'Page exceeded the 20000-element limit');
    }
    const rawResults = await runAxeScan(page);
    check();
    const violations = normalizeResults(rawResults.violations);
    const result = {
      url: rawResults.url, timestamp: rawResults.timestamp,
      totalViolations: violations.length, violations,
      manualReviewFindings: normalizeResults(rawResults.incomplete),
    };
    if (Buffer.byteLength(JSON.stringify(result)) > LIMITS.reportBytes) {
      throw new ScanError('RESOURCE_LIMIT', 'Scan report exceeded the 2 MiB limit');
    }
    return result;
  } catch (error) {
    if (failure) throw failure;
    throw scanFailure(error, stage);
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener('abort', aborted);
    await proxy?.close();
    await browser?.close();
  }
}
