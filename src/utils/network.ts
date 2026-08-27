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
  // MAC address requires native ARP table access (unavailable in Expo Go sandbox)
  macAddress: null;
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

// ── Phase 1: alive check ──────────────────────────────────────────────────────

/**
 * Quick alive probe on port 80.
 * - AbortError (timeout) → host unreachable → null
 * - Any other error (TCP RST) → host alive, port closed → {ip, responseTime}
 * - Success → host alive, HTTP running → {ip, responseTime}
 */
export async function probeAlive(
  ip: string,
  timeoutMs: number,
): Promise<{ ip: string; responseTime: number } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    await fetch(`http://${ip}`, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timer);
    return { ip, responseTime: Date.now() - start };
  } catch (e: any) {
    clearTimeout(timer);
    if (e.name === 'AbortError') return null;
    return { ip, responseTime: Date.now() - start };
  }
}

// ── Phase 2: enrichment helpers ───────────────────────────────────────────────

async function isPortOpen(ip: string, port: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 800);
  const start = Date.now();
  try {
    await fetch(`http://${ip}:${port}`, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timer);
    return true; // HTTP responded
  } catch (e: any) {
    clearTimeout(timer);
    const elapsed = Date.now() - start;
    if (e.name === 'AbortError') return false; // filtered / no host
    // iOS gives the same "Network request failed" for both RST (port closed) and
    // protocol mismatch (port open but non-HTTP). Distinguish via timing:
    //   fast  (<150ms) = TCP RST came back immediately = port CLOSED
    //   slow  (≥150ms) = TCP connected, then failed on protocol = port OPEN
    return elapsed >= 150;
  }
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

async function resolveHostname(ip: string): Promise<string | null> {
  const ptr = ip.split('.').reverse().join('.') + '.in-addr.arpa';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(ptr)}&type=PTR`,
      { headers: { Accept: 'application/dns-json' }, signal: controller.signal },
    );
    clearTimeout(timer);
    const data = await res.json() as { Answer?: Array<{ data: string }> };
    const record = data.Answer?.[0]?.data;
    return record ? record.replace(/\.$/, '') : null;
  } catch {
    clearTimeout(timer);
    return null;
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
  const portChecks = await Promise.all(
    PROBE_PORTS.map(async ({ port, name }) => ({
      port, name, open: await isPortOpen(ip, port),
    })),
  );
  const openPorts = portChecks.filter(p => p.open).map(({ port, name }) => ({ port, name }));
  const openNums  = openPorts.map(p => p.port);

  const httpPort = openNums.find(p => [80, 8080].includes(p));
  const [httpMeta, hostname] = await Promise.all([
    httpPort
      ? fetchHttpMeta(ip, httpPort)
      : Promise.resolve({ title: null, server: null }),
    resolveHostname(ip),
  ]);

  return {
    ip,
    responseTime,
    hostname,
    deviceType: classifyDevice(ip, openNums, httpMeta.server, httpMeta.title),
    openPorts,
    httpTitle: httpMeta.title,
    serverInfo: httpMeta.server,
    macAddress: null,
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
