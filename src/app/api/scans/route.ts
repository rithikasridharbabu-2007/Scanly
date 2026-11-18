import { NextResponse } from 'next/server';
import { resolvePublicUrl } from '../../../../lib/security/url-policy';
import { readJsonBody } from '../../../../lib/security/request-body';
import { ScanError } from '../../../../lib/security/limits';
import { getScanQueue } from '../../../../lib/queue/scan-queue';

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    {
      status: 'failed',
      error: { code, message },
    },
    { status, headers: status === 429 ? { 'Retry-After': '60' } : undefined }
  );
}

export async function POST(request: Request) {
  let body: { url?: unknown };

  try {
    body = await readJsonBody(request) as { url?: unknown };
  } catch (error) {
    if (error instanceof ScanError) return errorResponse(error.code, error.message, error.httpStatus);
    return errorResponse('INVALID_JSON', 'Request body must be valid JSON', 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return errorResponse('INVALID_JSON', 'Request body must be a JSON object', 400);
  }

  if (typeof body.url !== 'string' || !body.url.trim()) {
    return errorResponse('MISSING_URL', 'A "url" is required', 400);
  }

  try {
    const { url } = await resolvePublicUrl(body.url);
    const scan = getScanQueue().enqueue(url.toString());
    return NextResponse.json(scan, {
      status: 202, headers: { Location: '/api/scans?scanId=' + scan.scanId },
    });
  } catch (error) {
    if (error instanceof ScanError) return errorResponse(error.code, error.message, error.httpStatus);
    return errorResponse('QUEUE_UNAVAILABLE', 'The scan queue is temporarily unavailable', 503);
  }
}

export async function GET(request: Request) {
  const scanId = new URL(request.url).searchParams.get('scanId');
  if (!scanId) return errorResponse('MISSING_SCAN_ID', 'Missing "scanId" query parameter', 400);
  try {
    const scan = getScanQueue().get(scanId);
    if (!scan) return errorResponse('SCAN_NOT_FOUND', 'Scan not found', 404);
    return NextResponse.json(scan, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return errorResponse('QUEUE_UNAVAILABLE', 'The scan queue is temporarily unavailable', 503);
  }
}
