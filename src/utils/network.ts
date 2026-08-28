import TcpSocket from 'react-native-tcp-socket';

import { lookupMac } from '../../modules/arp';
import { mdnsLookup } from './mdns';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ServicePort {
  port: number;
  name: string;
}

export type DeviceType =
  | 'Router'
  | 'Mac'
  | 'Windows PC'
  | 'Linux Server'
  | 'NAS'
  | 'Printer'
  | 'IP Camera'
  | 'Apple TV'
  | 'Plex Server'
  | 'IoT Device'
  | 'Network Device'
  | 'Unknown'
  | 'Scanning…';

export interface Device {
  ip: string;
  responseTime: number;
  hostname: string | null;
  deviceType: DeviceType;
  openPorts: ServicePort[];
  httpTitle: string | null;
  serverInfo: string | null;
  // Read from the kernel ARP cache (iOS only, and only for hosts we just probed).
  // null whenever the cache has no resolved hardware address for the IP.
  macAddress: string | null;
  enriched: boolean;
}

// ── Port list ─────────────────────────────────────────────────────────────────

const PROBE_PORTS: ServicePort[] = [
  { port: 21,    name: 'FTP'      },
  { port: 22,    name: 'SSH'      },
  { port: 23,    name: 'Telnet'   },
  { port: 80,    name: 'HTTP'     },
  { port: 443,   name: 'HTTPS'    },
  { port: 445,   name: 'SMB'      },
  { port: 548,   name: 'AFP'      },
  { port: 554,   name: 'RTSP'     },
  { port: 631,   name: 'IPP'      },
  { port: 1883,  name: 'MQTT'     },
  { port: 3389,  name: 'RDP'      },
  { port: 5000,  name: 'UPnP'     },
  { port: 7000,  name: 'AirPlay'  },
  { port: 8080,  name: 'HTTP-Alt' },
  { port: 32400, name: 'Plex'     },
];

// ── TCP probe ─────────────────────────────────────────────────────────────────

type ProbeResult =
  | 'open'          // TCP handshake completed — something is at this address
  | 'refused'       // RST came back — something is at this address, port is not
  | 'unreachable'   // connect failed for a reason that proves nothing
  | 'timeout';      // nothing answered at all

// react-native-tcp-socket collapses NSError down to its localizedDescription before
// it reaches JS, so the POSIX errno is gone by the time we see it and the reason has
// to be read back out of the message.
//
// This distinction is the whole ballgame. ECONNREFUSED means a host sent an RST,
// which proves it exists. "No route to host" (EHOSTUNREACH — the kernel ARPed for
// the address and nothing answered), "Operation timed out", and local failures such
// as running out of file descriptors all mean we learned nothing. Treating that
// second group as proof of life invents devices that are not on the network.
//
// Foundation localises these strings. On a non-English device nothing matches and
// the scan degrades to reporting only hosts that complete a full handshake — it
// under-reports rather than inventing devices, which is the right way to fail.
const CONNECTION_REFUSED = /connection refused|econnrefused/i;

// The library emits an Error on some paths and a bare string on others.
function describeSocketError(err: Error): string {
  return String(err?.message ?? err ?? '');
}

// Every unfamiliar error string is a host we are now calling absent, so surface each
// distinct one once in development. If a real device shows up here, this regex is
// what needs widening.
const seenSocketErrors = new Set<string>();
function reportUnrecognisedError(reason: string): void {
  if (!reason || seenSocketErrors.has(reason)) return;
  seenSocketErrors.add(reason);
  console.warn(`[scan] treating as absent, unrecognised socket error: "${reason}"`);
}

/**
 * Raw TCP connect. Replaces the old fetch()-timing heuristics: connect() either
 * succeeds, is refused, or times out, so open/closed is now a fact rather than
 * an inference from elapsed milliseconds.
 */
function tcpProbe(
  ip: string,
  port: number,
  timeoutMs: number,
): Promise<{ result: ProbeResult; elapsed: number }> {
  return new Promise(resolve => {
    const start = Date.now();
    let settled = false;

    const finish = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve({ result, elapsed: Date.now() - start });
    };

    const socket = TcpSocket.createConnection({ host: ip, port }, () => finish('open'));
    socket.on('error', err => {
      const reason = describeSocketError(err);
      if (CONNECTION_REFUSED.test(reason)) {
        finish('refused');
        return;
      }
      if (__DEV__) reportUnrecognisedError(reason);
      finish('unreachable');
    });
    const timer = setTimeout(() => finish('timeout'), timeoutMs);
  });
}

// ── Phase 1: alive check ──────────────────────────────────────────────────────

/**
 * Quick alive probe on port 80. Reports a device only when the address itself
 * answered: a completed handshake, or an RST proving something holds that IP even
 * though port 80 is shut.
 *
 * Everything else counts as absent. This is deliberately biased towards
 * under-reporting — a phantom row is worse than a missing one, because it asserts
 * something about the user's network that is not true.
 *
 * Known blind spot: hosts that silently drop packets instead of sending RST are
 * indistinguishable from empty addresses, and read as down.
 */
export async function probeAlive(
  ip: string,
  timeoutMs: number,
): Promise<{ ip: string; responseTime: number } | null> {
  const { result, elapsed } = await tcpProbe(ip, 80, timeoutMs);
  const answered = result === 'open' || result === 'refused';
  return answered ? { ip, responseTime: elapsed } : null;
}

// ── Phase 2: enrichment helpers ───────────────────────────────────────────────

// Tuning knob: raise on slow/congested networks, lower to speed up enrichment.
const PORT_TIMEOUT_MS = 800;

// Concurrent port probes per host. Every probe holds a real file descriptor now,
// and enrichment runs for all alive hosts at once, so this is what keeps a busy
// subnet from exhausting the process fd limit.
const PORT_CONCURRENCY = 5;

async function isPortOpen(ip: string, port: number): Promise<boolean> {
  const { result } = await tcpProbe(ip, port, PORT_TIMEOUT_MS);
  return result === 'open';
}

async function fetchHttpMeta(
  ip: string,
  port: number,
): Promise<{ title: string | null; server: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`http://${ip}:${port}`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);
    const server = res.headers.get('server') ?? res.headers.get('Server') ?? null;
    const body = await res.text();
    const m = body.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
    const title = m ? m[1].trim().replace(/\s+/g, ' ') : null;
    return { title, server };
  } catch {
    clearTimeout(timer);
    return { title: null, server: null };
  }
}

function classifyDevice(
  ip: string,
  openNums: number[],
  server: string | null,
  title: string | null,
): DeviceType {
  const p = new Set(openNums);
  const s = (server ?? '').toLowerCase();
  const t = (title ?? '').toLowerCase();
  const lastOct = parseInt(ip.split('.')[3], 10);

  // AFP (548) = macOS file sharing; SSH+AirPlay is macOS AirPlay Receiver
  if (p.has(548))              return 'Mac';
  if (p.has(22) && p.has(7000)) return 'Mac';   // SSH + AirPlay = macOS, not Apple TV
  if (p.has(3389))             return 'Windows PC';
  if (p.has(7000))             return 'Apple TV';
  if (p.has(32400)) return 'Plex Server';
  if (p.has(554))  return 'IP Camera';
  if (p.has(631))  return 'Printer';
  if (p.has(1883)) return 'IoT Device';
  if (p.has(445) && p.has(22)) return 'NAS';
  if (p.has(445))  return 'Windows PC';
  if (p.has(22))   return 'Linux Server';

  if (p.has(80) || p.has(443) || p.has(8080)) {
    // .1 on a home subnet is almost always the gateway/router
    if (lastOct === 1) return 'Router';
    const routerKw = ['dd-wrt', 'openwrt', 'mikrotik', 'asus', 'tp-link',
                      'netgear', 'dlink', 'd-link', 'linksys', 'avm', 'fritz'];
    if (routerKw.some(kw => s.includes(kw))) return 'Router';
    if (['router', 'gateway', 'modem', 'fritz', 'airport'].some(kw => t.includes(kw))) return 'Router';
    if (['nginx', 'apache', 'iis', 'lighttpd', 'caddy'].some(kw => s.includes(kw))) return 'Linux Server';
    return 'Network Device';
  }

  return 'Unknown';
}

// ── Phase 2: full enrichment ──────────────────────────────────────────────────

export async function enrichDevice(ip: string, responseTime: number): Promise<Device> {
  const openPorts: ServicePort[] = [];
  for (let i = 0; i < PROBE_PORTS.length; i += PORT_CONCURRENCY) {
    const chunk = PROBE_PORTS.slice(i, i + PORT_CONCURRENCY);
    const checks = await Promise.all(
      chunk.map(async ({ port, name }) => ({ port, name, open: await isPortOpen(ip, port) })),
    );
    openPorts.push(...checks.filter(c => c.open).map(({ port, name }) => ({ port, name })));
  }
  const openNums  = openPorts.map(p => p.port);

  const httpPort = openNums.find(p => [80, 8080].includes(p));
  const httpMeta = httpPort
    ? await fetchHttpMeta(ip, httpPort)
    : { title: null, server: null };

  return {
    ip,
    responseTime,
    // May still be null here if mDNS has not answered yet; useNetworkScanner
    // patches late arrivals into the rendered device.
    hostname: mdnsLookup(ip),
    deviceType: classifyDevice(ip, openNums, httpMeta.server, httpMeta.title),
    openPorts,
    httpTitle: httpMeta.title,
    serverInfo: httpMeta.server,
    // Read after the port sweep — those connections are what put this host in
    // the ARP cache in the first place.
    macAddress: lookupMac(ip),
    enriched: true,
  };
}

// ── Subnet utilities ──────────────────────────────────────────────────────────

export function parseSubnet(ip: string): string {
  const parts = ip.split('.');
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

export function generateIpRange(subnet: string): string[] {
  return Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`);
}

export function lastOctet(ip: string): number {
  return parseInt(ip.split('.')[3], 10);
}
