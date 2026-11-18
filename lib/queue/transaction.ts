import type { DatabaseSync } from 'node:sqlite';

/** Synchronous transaction: acquire the write lock before reading job state. */
export function immediateTransaction<T>(db: DatabaseSync, action: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    // Some SQLite failures roll back automatically. Keep the original error.
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}
