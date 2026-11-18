import { ScanError } from '../security/limits';

export type ScanStage = 'setup' | 'browser' | 'navigation' | 'analysis';

/** Classify failures without exposing target URLs, local paths or page content. */
export function scanFailure(cause: unknown, stage: ScanStage): ScanError {
  if (cause instanceof ScanError) return cause;
  const message = cause instanceof Error ? cause.message : '';
  if (cause instanceof Error && cause.name === 'TimeoutError') {
    return new ScanError('SCAN_TIMEOUT', 'Page navigation or browser operation timed out');
  }
  if (stage === 'browser') {
    if (/Executable doesn't exist|browser executable.*not found/i.test(message)) {
      return new ScanError('BROWSER_NOT_INSTALLED', 'Chromium is not installed for the worker. Run npx playwright install chromium in the worker environment, then restart the worker.');
    }
    return new ScanError('BROWSER_LAUNCH_FAILED', 'Chromium could not start. Check the worker browser installation and sandbox configuration.');
  }
  if (stage === 'navigation') {
    if (/ERR_CERT_|ERR_SSL_/i.test(message)) return new ScanError('TLS_ERROR', 'The destination failed HTTPS certificate or TLS validation');
    if (/ERR_PROXY_CONNECTION_FAILED|ERR_TUNNEL_CONNECTION_FAILED/i.test(message)) return new ScanError('PROXY_ERROR', 'The scanner could not establish a connection through its outbound proxy');
    return new ScanError('NAVIGATION_FAILED', 'The browser could not load the requested page');
  }
  if (stage === 'analysis') return new ScanError('ANALYSIS_FAILED', 'The accessibility analysis could not complete');
  return new ScanError('SCAN_SETUP_FAILED', 'The scanner could not initialize its browser context or network controls');
}
