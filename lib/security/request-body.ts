import { LIMITS, ScanError } from './limits';

/** Bound streamed bodies too; Content-Length alone is not trustworthy. */
export async function readJsonBody(request: Request): Promise<unknown> {
  const length = Number(request.headers.get('content-length'));
  if (length > LIMITS.bodyBytes) throw new ScanError('BODY_TOO_LARGE', 'Request body exceeds 16 KiB', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ScanError('INVALID_JSON', 'Request body must be valid JSON');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      void reader.cancel().catch(() => {});
      reject(new ScanError('BODY_TIMEOUT', 'Request body timed out', 408));
    }, LIMITS.bodyMs);
  });
  try {
    return await Promise.race([timeout, (async () => {
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (expired) throw new ScanError('BODY_TIMEOUT', 'Request body timed out', 408);
        if (done) break;
        size += value.byteLength;
        if (size > LIMITS.bodyBytes) throw new ScanError('BODY_TOO_LARGE', 'Request body exceeds 16 KiB', 413);
        chunks.push(value);
      }
      try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
      catch { throw new ScanError('INVALID_JSON', 'Request body must be valid JSON'); }
    })()]);
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}
