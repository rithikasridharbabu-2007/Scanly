import type { DatabaseSync } from 'node:sqlite';
import { immediateTransaction } from './transaction';
import { randomUUID } from 'node:crypto';
import type { NormalizedScanResult, NormalizedViolation } from '../accessibility/scanner';

export function saveFindings(db: DatabaseSync, scanId: string, result: NormalizedScanResult) {
  const insert = db.prepare(`INSERT INTO findings
    (id, scan_id, kind, position, rule_id, impact, description, help_url, affected_nodes, html_snippets_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const save = (kind: string, findings: NormalizedViolation[]) => findings.forEach((finding, index) => {
    insert.run(randomUUID(), scanId, kind, index, finding.id, finding.impact ?? null,
      finding.description, finding.helpUrl, finding.affectedNodes, JSON.stringify(finding.htmlSnippets));
  });
  save('violation', result.violations);
  save('needs_review', result.manualReviewFindings ?? []);
}

/** Upgrade the original unversioned queue without discarding existing reports. */
export function migrate(db: DatabaseSync) {
  immediateTransaction(db, () => {
    const version = db.prepare('PRAGMA user_version').get()!.user_version as number;
    if (version > 1) throw new Error('Database schema is newer than this application');
    if (version === 1) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS scans (
        id TEXT PRIMARY KEY,
        requested_url TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        started_at INTEGER,
        finished_at INTEGER,
        attempts INTEGER NOT NULL DEFAULT 0,
        lease_token TEXT,
        lease_expires_at INTEGER,
        result_json TEXT,
        error_code TEXT,
        error_message TEXT
      );
      CREATE INDEX IF NOT EXISTS scans_queue ON scans(status, created_at);
      CREATE INDEX IF NOT EXISTS scans_leases ON scans(status, lease_expires_at);
      ALTER TABLE scans ADD COLUMN final_url TEXT;
      ALTER TABLE scans ADD COLUMN result_timestamp TEXT;
      CREATE TABLE findings (
        id TEXT PRIMARY KEY,
        scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK(kind IN ('violation', 'needs_review')),
        position INTEGER NOT NULL,
        rule_id TEXT NOT NULL,
        impact TEXT,
        description TEXT NOT NULL,
        help_url TEXT NOT NULL,
        affected_nodes INTEGER NOT NULL CHECK(affected_nodes >= 0),
        html_snippets_json TEXT NOT NULL,
        UNIQUE(scan_id, kind, position)
      );
      CREATE TABLE manual_reviews (
        id TEXT PRIMARY KEY,
        scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
        check_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('needs_review', 'passed', 'failed', 'not_applicable')),
        notes TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX manual_reviews_scan ON manual_reviews(scan_id, created_at);
    `);
    const old = db.prepare('SELECT id, result_json FROM scans WHERE result_json IS NOT NULL').all() as { id: string; result_json: string }[];
    for (const row of old) {
      const result = JSON.parse(row.result_json) as NormalizedScanResult;
      saveFindings(db, row.id, result);
      db.prepare('UPDATE scans SET final_url = ?, result_timestamp = ? WHERE id = ?')
        .run(result.url, result.timestamp, row.id);
    }
    // Keep legacy JSON for migration safety, but new reads/writes use the tables.
    db.exec('PRAGMA user_version = 1');
  });
}
