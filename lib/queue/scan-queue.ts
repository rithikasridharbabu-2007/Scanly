import { DatabaseSync } from 'node:sqlite';
import { immediateTransaction } from './transaction';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { migrate, saveFindings } from './schema';
import { LIMITS, ScanError } from '../security/limits';
import type { NormalizedScanResult, NormalizedViolation } from '../accessibility/scanner';

export const LEASE_MS = 60_000;
const MAX_ATTEMPTS = 3;

interface Row {
  id: string;
  requested_url: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  created_at: number;
  updated_at: number;
  started_at: number | null;
  finished_at: number | null;
  attempts: number;
  lease_token: string | null;
  final_url: string | null;
  result_timestamp: string | null;
  error_code: string | null;
  error_message: string | null;
}

export interface ScanJob {
  scanId: string;
  requestedUrl: string;
  leaseToken: string;
}

export interface ManualReviewInput {
  checkName: string;
  status: 'needs_review' | 'passed' | 'failed' | 'not_applicable';
  notes: string;
}

/** The database is also the queue: accepting a scan is one durable INSERT. */
export class ScanQueue {
  private db: DatabaseSync;

  constructor(filename: string) {
    if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA busy_timeout = 5000');
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = FULL');
    this.db.exec('PRAGMA foreign_keys = ON');
    try { migrate(this.db); } catch (error) { this.db.close(); throw error; }
  }

  enqueue(requestedUrl: string, now = Date.now()) {
    return immediateTransaction(this.db, () => {
      this.expireQueued(now);
      const count = this.db.prepare("SELECT count(*) AS count FROM scans WHERE status IN ('queued','running')").get()!.count as number;
      if (count >= LIMITS.activeScans) throw new ScanError('QUEUE_FULL', 'The scan queue is full; try again later', 429);
      const scanId = randomUUID();
      this.db.prepare(`INSERT INTO scans (id, requested_url, status, created_at, updated_at)
        VALUES (?, ?, 'queued', ?, ?)`).run(scanId, requestedUrl, now, now);
      return this.get(scanId, now)!;
    });
  }

  private expireQueued(now: number) {
    this.db.prepare(`UPDATE scans SET status = 'failed', error_code = 'QUEUE_TIMEOUT',
      error_message = 'Scan waited more than 10 minutes in the queue', updated_at = ?, finished_at = ?
      WHERE status = 'queued' AND created_at <= ?`).run(now, now, now - LIMITS.queueWaitMs);
  }

  get(scanId: string, now = Date.now()) {
    this.expireQueued(now);
    const row = this.db.prepare('SELECT * FROM scans WHERE id = ?').get(scanId) as Row | undefined;
    if (!row) return null;
    const iso = (value: number | null) => value === null ? null : new Date(value).toISOString();
    return {
      scanId: row.id, requestedUrl: row.requested_url, status: row.status,
      createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
      startedAt: iso(row.started_at), finishedAt: iso(row.finished_at),
      attempts: row.attempts,
      ...(row.status === 'completed' ? { result: this.readResult(row) } : {}),
      manualReviews: this.listManualReviews(scanId),
      ...(row.error_code ? { error: { code: row.error_code, message: row.error_message } } : {}),
    };
  }

  private readResult(row: Row): NormalizedScanResult {
    const rows = this.db.prepare(`SELECT * FROM findings WHERE scan_id = ? ORDER BY kind, position`)
      .all(row.id) as {
        kind: string; rule_id: string; impact: string | null; description: string;
        help_url: string; affected_nodes: number; html_snippets_json: string;
      }[];
    const map = (kind: string): NormalizedViolation[] => rows.filter(item => item.kind === kind).map(item => ({
      id: item.rule_id, impact: item.impact, description: item.description,
      helpUrl: item.help_url, affectedNodes: item.affected_nodes,
      htmlSnippets: JSON.parse(item.html_snippets_json) as string[],
    }));
    const violations = map('violation');
    return { url: row.final_url!, timestamp: row.result_timestamp!,
      totalViolations: violations.length, violations, manualReviewFindings: map('needs_review') };
  }

  listManualReviews(scanId: string) {
    const rows = this.db.prepare(`SELECT id, scan_id, check_name, status, notes, created_at, updated_at
      FROM manual_reviews WHERE scan_id = ? ORDER BY created_at, rowid`).all(scanId) as {
        id: string; scan_id: string; check_name: string; status: ManualReviewInput['status'];
        notes: string; created_at: number; updated_at: number;
      }[];
    return rows.map(row => ({ reviewId: row.id, scanId: row.scan_id,
      checkName: row.check_name, status: row.status, notes: row.notes,
      createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() }));
  }

  addManualReview(scanId: string, input: ManualReviewInput, now = Date.now()) {
    return immediateTransaction(this.db, () => {
      if (!this.db.prepare('SELECT id FROM scans WHERE id = ?').get(scanId)) return null;
      const reviewId = randomUUID();
      this.db.prepare(`INSERT INTO manual_reviews
        (id, scan_id, check_name, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(reviewId, scanId, input.checkName, input.status, input.notes, now, now);
      this.db.prepare('UPDATE scans SET updated_at = ? WHERE id = ?').run(now, scanId);
      return this.listManualReviews(scanId).find(review => review.reviewId === reviewId)!;
    });
  }

  claim(now = Date.now()): ScanJob | null {
    // BEGIN IMMEDIATE serializes competing claims across processes. Never hold
    // this transaction open while the browser is running.
    return immediateTransaction(this.db, () => {
      this.db.prepare(`UPDATE scans SET
        status = CASE WHEN attempts >= ? THEN 'failed' ELSE 'queued' END,
        finished_at = CASE WHEN attempts >= ? THEN ? ELSE NULL END,
        error_code = CASE WHEN attempts >= ? THEN 'WORKER_LOST' ELSE NULL END,
        error_message = CASE WHEN attempts >= ? THEN 'The worker stopped before completing the scan' ELSE NULL END,
        lease_token = NULL, lease_expires_at = NULL, updated_at = ?
        WHERE status = 'running' AND lease_expires_at <= ?`)
        .run(MAX_ATTEMPTS, MAX_ATTEMPTS, now, MAX_ATTEMPTS, MAX_ATTEMPTS, now, now);
      this.expireQueued(now);
      const running = this.db.prepare("SELECT count(*) FROM scans WHERE status = 'running'").get()!.count as number;
      if (running >= LIMITS.runningScans) return null;
      const row = this.db.prepare(`SELECT * FROM scans WHERE status = 'queued'
        ORDER BY created_at, rowid LIMIT 1`).get() as Row | undefined;
      if (!row) return null;
      const leaseToken = randomUUID();
      this.db.prepare(`UPDATE scans SET status = 'running', attempts = attempts + 1,
        started_at = ?, updated_at = ?, lease_token = ?, lease_expires_at = ?
        WHERE id = ?`).run(now, now, leaseToken, now + LEASE_MS, row.id);
      return { scanId: row.id, requestedUrl: row.requested_url, leaseToken };
    });
  }

  heartbeat(job: ScanJob, now = Date.now()) {
    return this.db.prepare(`UPDATE scans SET lease_expires_at = ?, updated_at = ?
      WHERE id = ? AND status = 'running' AND lease_token = ? AND lease_expires_at > ?`)
      .run(now + LEASE_MS, now, job.scanId, job.leaseToken, now).changes === 1;
  }

  complete(job: ScanJob, result: NormalizedScanResult, now = Date.now()) {
    if (Buffer.byteLength(JSON.stringify(result)) > LIMITS.reportBytes) {
      throw new ScanError('RESOURCE_LIMIT', 'Scan report exceeded the 2 MiB limit');
    }
    return immediateTransaction(this.db, () => {
      if (!this.finish(job, null, null, null, now)) return false;
      this.db.prepare('UPDATE scans SET final_url = ?, result_timestamp = ? WHERE id = ?')
        .run(result.url, result.timestamp, job.scanId);
      saveFindings(this.db, job.scanId, result);
      return true;
    });
  }

  fail(job: ScanJob, code: string, message: string, now = Date.now()) {
    return this.finish(job, null, code, message, now);
  }

  private finish(job: ScanJob, result: string | null, code: string | null, message: string | null, now: number) {
    // Fencing prevents a worker with an expired/reassigned lease overwriting results.
    return this.db.prepare(`UPDATE scans SET status = ?, result_json = ?, error_code = ?,
      error_message = ?, updated_at = ?, finished_at = ?, lease_token = NULL, lease_expires_at = NULL
      WHERE id = ? AND status = 'running' AND lease_token = ? AND lease_expires_at > ?`)
      .run(code ? 'failed' : 'completed', result, code, message, now, now,
        job.scanId, job.leaseToken, now).changes === 1;
  }

  close() { this.db.close(); }
}

export function databasePath() {
  // This is runtime storage, not an asset Next.js should bundle into deployments.
  return resolve(/* turbopackIgnore: true */ process.env.SCANLY_DB_PATH || 'data/scanly.sqlite');
}

const globalQueue = globalThis as typeof globalThis & { scanlyQueue?: ScanQueue };
export function getScanQueue() {
  return globalQueue.scanlyQueue ??= new ScanQueue(databasePath());
}
