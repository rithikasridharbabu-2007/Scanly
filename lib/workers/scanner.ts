import { setTimeout as delay } from 'node:timers/promises';
import { runScan } from './run-scan';
import { publicError } from '../security/limits';
import { databasePath, ScanQueue } from '../queue/scan-queue';

const queue = new ScanQueue(databasePath());
let stopping = false;
const once = process.argv.includes('--once');
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

async function main() {
  console.info('Scanner worker started (concurrency: 1)');
  while (!stopping) {
    const job = queue.claim();
    if (!job) {
      if (once) break;
      await delay(1000);
      continue;
    }
    console.info(JSON.stringify({ scanId: job.scanId, event: 'started' }));
    const abort = new AbortController();
    const heartbeat = setInterval(() => {
      try {
        if (!queue.heartbeat(job)) abort.abort();
      } catch {
        // Stop working if ownership cannot be verified; the lease will recover.
        abort.abort();
      }
    }, 15_000);
    try {
      const result = await runScan(job.requestedUrl, abort.signal);
      const saved = queue.complete(job, result);
      console.info(JSON.stringify({ scanId: job.scanId, event: saved ? 'completed' : 'lease_lost' }));
    } catch (cause) {
      // Raw browser errors may contain target page data or URL credentials.
      const error = publicError(cause);
      const saved = queue.fail(job, error.code, error.message);
      console.error(JSON.stringify({ scanId: job.scanId, event: saved ? 'failed' : 'lease_lost', code: error.code }));
    } finally {
      clearInterval(heartbeat);
    }
    if (once) break;
  }
}

main().catch(error => {
  console.error('Scanner worker stopped:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
}).finally(() => queue.close());
