import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { LIMITS, ScanError } from './limits';

export type Resolver = (hostname: string) => Promise<{ address: string; family: number }[]>;
const resolveHost: Resolver = hostname => lookup(hostname, { all: true, verbatim: true });
const blocked = () => new ScanError('BLOCKED_URL', 'Only public HTTP/HTTPS destinations on ports 80 and 443 can be scanned');

export function isPublicAddress(address: string) {
  try {
    const ip = ipaddr.parse(address);
    // Reject mapped/transition IPv6 addresses rather than decoding them permissively.
    if (ip.range() !== 'unicast') return false;
    if (ip.kind() === 'ipv6') return ip.match(ipaddr.parseCIDR('2000::/3'));
    return !['192.0.0.0/24', '192.88.99.0/24'].some(cidr => ip.match(ipaddr.parseCIDR(cidr)));
  } catch { return false; }
}

export function parseScanUrl(input: string) {
  if (input.length > 2048) throw blocked();
  let url: URL;
  try { url = new URL(input); } catch { throw new ScanError('INVALID_URL', 'The URL is invalid'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      (url.port && url.port !== (url.protocol === 'http:' ? '80' : '443'))) throw blocked();
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') || hostname.endsWith('.internal') ||
      (!isIP(hostname) && !hostname.includes('.'))) throw blocked();
  if (isIP(hostname) && !isPublicAddress(hostname)) throw blocked();
  return url;
}

/** Return a validated IP for the connection; callers must not resolve it again. */
export async function resolvePublicUrl(input: string, resolver: Resolver = resolveHost) {
  const url = parseScanUrl(input);
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] :
      await Promise.race([
        resolver(hostname),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ScanError('DNS_TIMEOUT', 'Destination lookup timed out')), LIMITS.dnsMs); }),
      ]);
    if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw blocked();
    return { url, address: addresses[0].address, family: addresses[0].family };
  } catch (error) {
    if (error instanceof ScanError) throw error;
    throw new ScanError('DNS_FAILED', 'The destination could not be resolved');
  } finally { clearTimeout(timer); }
}
