import { createServer, request as httpRequest } from 'node:http';
import { connect, type Socket } from 'node:net';
import { LIMITS, ScanError, publicError } from './limits';
import { resolvePublicUrl } from './url-policy';

/** Per-job loopback proxy. Every upstream connection uses a validated literal IP.
 * HTTPS stays end-to-end encrypted: CONNECT pins the IP, Chromium checks TLS.
 */
export async function startScanProxy(onFailure: (error: ScanError) => void) {
  const sockets = new Set<Socket>();
  let closed = false;
  let bytes = 0;
  let connections = 0;
  const fail = (error: unknown) => {
    if (!closed) onFailure(publicError(error));
    closed = true;
    for (const socket of sockets) socket.destroy();
  };
  const track = (socket: Socket, incoming = false) => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.once('close', () => { sockets.delete(socket); if (incoming) connections--; });
    socket.setTimeout(LIMITS.socketMs, () => socket.destroy());
    socket.on('data', (data: Buffer) => {
      bytes += data.length;
      if (bytes > LIMITS.networkBytes) fail(new ScanError('RESOURCE_LIMIT', 'Scan exceeded the 50 MiB network budget'));
    });
  };
  const server = createServer({ maxHeaderSize: 16 * 1024 }, (request, response) => {
    void (async () => {
      const destination = await resolvePublicUrl(request.url ?? '');
      if (destination.url.protocol !== 'http:') throw new ScanError('BLOCKED_URL', 'Invalid proxy request');
      if (closed || request.destroyed) return;
      const headers = { ...request.headers };
      for (const name of (headers.connection ?? '').split(',')) delete headers[name.trim().toLowerCase()];
      for (const name of ['connection', 'proxy-connection', 'proxy-authorization', 'upgrade', 'keep-alive']) delete headers[name];
      headers.host = destination.url.host;
      headers.connection = 'close';
      const upstream = httpRequest({
        hostname: destination.address, family: destination.family, port: 80,
        method: request.method, path: destination.url.pathname + destination.url.search,
        headers, agent: false, timeout: LIMITS.socketMs,
      }, remote => {
        response.writeHead(remote.statusCode ?? 502, remote.headers);
        remote.pipe(response);
        remote.on('error', () => response.destroy());
      });
      upstream.on('socket', socket => track(socket));
      upstream.on('timeout', () => upstream.destroy());
      upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
      response.on('close', () => upstream.destroy());
      request.pipe(upstream);
    })().catch(error => { response.destroy(); fail(error); });
  });
  server.on('connection', socket => {
    if (closed) { socket.destroy(); return; }
    connections++;
    track(socket, true);
    if (connections > LIMITS.connections) fail(new ScanError('RESOURCE_LIMIT', 'Scan exceeded the connection limit'));
  });
  server.on('connect', (request, client, head) => {
    void (async () => {
      if (!request.url || /[/?#@]/.test(request.url) || !request.url.endsWith(':443')) {
        throw new ScanError('BLOCKED_URL', 'Only HTTPS tunnels on port 443 are permitted');
      }
      const destination = await resolvePublicUrl(`https://${request.url}`);
      if (closed || client.destroyed) return;
      const upstream = connect({ host: destination.address, family: destination.family, port: 443 });
      track(upstream);
      upstream.once('connect', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        client.pipe(upstream);
        upstream.pipe(client);
      });
      upstream.on('error', () => client.destroy());
      upstream.on('close', () => client.destroy());
      client.on('close', () => upstream.destroy());
    })().catch(error => { client.destroy(); fail(error); });
  });
  // WebSockets are not needed for an accessibility snapshot.
  server.on('upgrade', (_request, socket) => socket.destroy());
  server.headersTimeout = LIMITS.socketMs;
  server.requestTimeout = LIMITS.socketMs;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Proxy failed to listen');
  return {
    server: `http://127.0.0.1:${address.port}`,
    close: async () => {
      closed = true;
      for (const socket of sockets) socket.destroy();
      await new Promise<void>(resolve => server.close(() => resolve()));
    },
  };
}
