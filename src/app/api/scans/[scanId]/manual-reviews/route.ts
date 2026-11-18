import { NextResponse } from 'next/server';
import { readJsonBody } from '../../../../../../lib/security/request-body';
import { ScanError } from '../../../../../../lib/security/limits';
import { getScanQueue, type ManualReviewInput } from '../../../../../../lib/queue/scan-queue';

type Context = { params: Promise<{ scanId: string }> };
const statuses = new Set(['needs_review', 'passed', 'failed', 'not_applicable']);
const error = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message } }, { status });

export async function GET(_request: Request, context: Context) {
  const { scanId } = await context.params;
  try {
    const scan = getScanQueue().get(scanId);
    if (!scan) return error('SCAN_NOT_FOUND', 'Scan not found', 404);
    return NextResponse.json({ scanId, manualReviews: scan.manualReviews },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return error('DATABASE_UNAVAILABLE', 'The scan database is temporarily unavailable', 503);
  }
}

export async function POST(request: Request, context: Context) {
  let body: unknown;
  try { body = await readJsonBody(request); }
  catch (cause) { return cause instanceof ScanError ? error(cause.code, cause.message, cause.httpStatus) : error('INVALID_JSON', 'Request body must be valid JSON', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return error('INVALID_REVIEW', 'Request body must be a review object', 400);
  }
  const { checkName, status, notes } = body as Record<string, unknown>;
  if (typeof checkName !== 'string' || !checkName.trim() || checkName.length > 200 ||
      typeof status !== 'string' || !statuses.has(status) ||
      typeof notes !== 'string' || notes.length > 10000) {
    return error('INVALID_REVIEW', 'Provide checkName (1–200 characters), status (needs_review, passed, failed, or not_applicable), and notes (up to 10000 characters)', 400);
  }
  const { scanId } = await context.params;
  try {
    const review = getScanQueue().addManualReview(scanId, {
      checkName: checkName.trim(), status: status as ManualReviewInput['status'], notes,
    });
    if (!review) return error('SCAN_NOT_FOUND', 'Scan not found', 404);
    return NextResponse.json(review, { status: 201 });
  } catch {
    return error('DATABASE_UNAVAILABLE', 'The scan database is temporarily unavailable', 503);
  }
}
