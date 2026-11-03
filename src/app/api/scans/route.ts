import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { performFullScan, type NormalizedScanResult } from '../../../../lib/types/scan';

type ScanRecord =
  | { status: 'pending'; requestedUrl: string }
  | { status: 'completed'; requestedUrl: string; result: NormalizedScanResult }
  | {
      status: 'failed';
      requestedUrl: string;
      error: { code: string; message: string };
    };

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    {
      status: 'failed',
      error: { code, message },
    },
    { status }
  );
}

// Keep the store on globalThis so Next's development hot reload does not lose
// scan records between the POST and the follow-up GET request.
// Use a database or job queue for production deployments.
const globalForScans = globalThis as typeof globalThis & {
  __scanStore?: Map<string, ScanRecord>;
};

const scans = globalForScans.__scanStore ?? new Map<string, ScanRecord>();
globalForScans.__scanStore = scans;

export async function POST(request: Request) {
  let body: { url?: unknown };

  try {
    body = await request.json();
  } catch {
    return errorResponse('INVALID_JSON', 'Request body must be valid JSON', 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return errorResponse('INVALID_JSON', 'Request body must be a JSON object', 400);
  }

  if (typeof body.url !== 'string' || !body.url.trim()) {
    return errorResponse('MISSING_URL', 'A "url" is required', 400);
  }

  let url: URL;
  try {
    url = new URL(body.url);
  } catch {
    return errorResponse('INVALID_URL', 'The URL is invalid', 400);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return errorResponse(
      'BLOCKED_URL',
      'Only http and https URLs can be scanned',
      400
    );
  }

  const scanId = randomUUID();
  const requestedUrl = url.toString();
  scans.set(scanId, { status: 'pending', requestedUrl });

  // Start the scan without making the client wait for Playwright to finish.
  void performFullScan(requestedUrl)
    .then(result => {
      scans.set(scanId, { status: 'completed', requestedUrl, result });
    })
    .catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Scan ${scanId} failed: ${message}`);
      scans.set(scanId, {
        status: 'failed',
        requestedUrl,
        error: {
          code: 'SCAN_FAILED',
          message: 'The scan could not be completed',
        },
      });
    });

  return NextResponse.json(
    { scanId, requestedUrl, status: 'pending' },
    { status: 202 }
  );
}

export async function GET(request: Request) {
  const scanId = new URL(request.url).searchParams.get('scanId');

  if (!scanId) {
    return errorResponse('MISSING_SCAN_ID', 'Missing "scanId" query parameter', 400);
  }

  const scan = scans.get(scanId);

  if (!scan) {
    return errorResponse('SCAN_NOT_FOUND', 'Scan not found', 404);
  }

  if (scan.status === 'completed') {
    return NextResponse.json({ scanId, status: scan.status, result: scan.result });
  }

  return NextResponse.json({ scanId, ...scan }, {
    status: scan.status === 'failed' ? 500 : 200,
  });
}
