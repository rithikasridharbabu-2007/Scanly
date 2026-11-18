import { fork, execFile, type ForkOptions } from 'node:child_process';
import { resolve } from 'node:path';
import type { NormalizedScanResult } from '../accessibility/scanner';
import { LIMITS, ScanError } from '../security/limits';

/** The deadline lives outside the browser/scan process, so hung JS cannot block it. */
export function runScan(url: string, signal?: AbortSignal, timeoutMs: number = LIMITS.scanMs): Promise<NormalizedScanResult> {
  if (signal?.aborted) return Promise.reject(new ScanError('SCAN_CANCELLED', 'The scan was cancelled'));
  const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(path|systemroot|windir|temp|tmp|tmpdir|home|userprofile|localappdata|lang|playwright_browsers_path|node_extra_ca_certs)$/i.test(key)) env[key] = value;
  }
  const options: ForkOptions & { windowsHide: boolean } = {
    execArgv: ['--import', 'tsx', '--max-old-space-size=256'],
    detached: process.platform !== 'win32', windowsHide: true,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env,
  };
  const child = fork(resolve('lib/workers/scan-child.ts'), [], options);
  return new Promise((accept, reject) => {
    let finishing = false;
    const finish = (error?: Error, result?: NormalizedScanResult) => {
      if (finishing) return;
      finishing = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      const done = () => error ? reject(error) : accept(result!);
      if (!child.pid) { done(); return; }
      if (process.platform === 'win32') {
        // taskkill /T includes Chromium descendants; no shell interpolation.
        execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => done());
      } else {
        // Playwright creates a separate process group for Chromium. Killing only
        // the Node child's group would leave that browser alive after a hang.
        execFile('ps', ['-eo', 'pid=,ppid='], (psError, output) => {
          const descendants = new Set<number>([child.pid!]);
          if (!psError) {
            const rows = output.trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
            let changed = true;
            while (changed) {
              changed = false;
              for (const [pid, parent] of rows) {
                if (descendants.has(parent) && !descendants.has(pid)) { descendants.add(pid); changed = true; }
              }
            }
          }
          for (const pid of [...descendants].reverse()) {
            try { process.kill(-pid, 'SIGKILL'); }
            catch { try { process.kill(pid, 'SIGKILL'); } catch { /* Already exited. */ } }
          }
          if (child.exitCode !== null || child.signalCode !== null) done();
          else child.once('exit', done);
        });
      }
    };
    const abort = () => finish(new ScanError('SCAN_CANCELLED', 'The scan was cancelled'));
    const timer = setTimeout(() => finish(new ScanError('SCAN_TIMEOUT', 'Scan exceeded its execution deadline')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    child.once('error', () => finish(new ScanError('WORKER_FAILED', 'The scan process could not start')));
    child.once('exit', () => finish(new ScanError('WORKER_FAILED', 'The scan process stopped unexpectedly')));
    child.once('message', (message: { result?: NormalizedScanResult; error?: { code: string; message: string } }) => {
      if (message.error) finish(new ScanError(message.error.code, message.error.message));
      else if (message.result) finish(undefined, message.result);
      else finish(new ScanError('WORKER_FAILED', 'The scan process returned an invalid result'));
    });
    child.send(url, error => { if (error) finish(new ScanError('WORKER_FAILED', 'The scan process could not start')); });
    if (signal?.aborted) abort();
  });
}
