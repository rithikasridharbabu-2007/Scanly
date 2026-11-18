export const LIMITS = {
  activeScans: 100,
  runningScans: 2,
  queueWaitMs: 10 * 60_000,
  scanMs: 90_000,
  navigationMs: 30_000,
  dnsMs: 3_000,
  socketMs: 15_000,
  requests: 250,
  connections: 16,
  redirects: 10,
  networkBytes: 50 * 1024 * 1024,
  documentNodes: 20_000,
  reportBytes: 2 * 1024 * 1024,
  bodyBytes: 16 * 1024,
  bodyMs: 5_000,
} as const;

export class ScanError extends Error {
  constructor(public code: string, message: string, public httpStatus = 400) {
    super(message);
    this.name = 'ScanError';
  }
}

export function publicError(error: unknown) {
  return error instanceof ScanError ? error : new ScanError('SCAN_FAILED', 'The scan could not be completed', 500);
}
