export interface Device {
  ip: string;
  responseTime: number;
  hasHttp: boolean;
  serverInfo: string | null;
}

/**
 * Probes a single IP via HTTP HEAD.
 *
 * Detection logic:
 *   - AbortError (our timeout fires)  → host not reachable  → null
 *   - Any other error (TCP RST, etc.) → host is up, port 80 closed → Device
 *   - Success                         → host is up, HTTP running     → Device
 *
 * On a local LAN, ARP for a live host resolves in <1 ms and TCP RST is
 * immediate, so only unreachable IPs will exceed timeoutMs.
 */
export async function probeIp(ip: string, timeoutMs: number): Promise<Device | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const response = await fetch(`http://${ip}`, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timer);
    return {
      ip,
      responseTime: Date.now() - start,
      hasHttp: true,
      serverInfo: response.headers.get('server'),
    };
  } catch (error: any) {
    clearTimeout(timer);
    if (error.name === 'AbortError') return null;
    return {
      ip,
      responseTime: Date.now() - start,
      hasHttp: false,
      serverInfo: null,
    };
  }
}

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
