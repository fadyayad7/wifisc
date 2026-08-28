import Zeroconf from 'react-native-zeroconf';

/**
 * Bonjour hostname discovery.
 *
 * Replaces the old reverse-PTR-over-DoH lookup, which asked a public resolver
 * about RFC1918 addresses and therefore almost always answered null. Devices
 * announce their own `.local` name over mDNS, so we ask them directly.
 *
 * iOS note: this goes through NSNetServiceBrowser, NOT raw multicast. Sending
 * raw mDNS packets to 224.0.0.251 needs the com.apple.developer.networking.multicast
 * entitlement, which requires per-app approval from Apple. Bonjour APIs only need
 * NSBonjourServices + the local network permission we already request.
 */

// Every type here MUST also appear in app.json → ios.infoPlist.NSBonjourServices.
// iOS 14+ silently returns zero results for service types not declared there.
// Ordered by hostname yield: workstation is advertised by macOS and by Linux
// running avahi, so it names the most hosts per second of scanning.
const SERVICE_TYPES = [
  'workstation',
  'device-info',
  'smb',
  'http',
  'airplay',
  'googlecast',
  'ipp',
  'ssh',
];

// Dwell per service type. The browser is single-shot — react-native-zeroconf's
// native scan() stops any previous browser — so types are walked in sequence and
// total discovery time is SERVICE_TYPES.length * this. Calibration knob: raise on
// slow/busy networks where responses trickle in, lower to finish sooner.
const SERVICE_DWELL_MS = 2000;

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

// ip → hostname, filled as services resolve. Read by enrichDevice.
const table = new Map<string, string>();

// There is one native browser shared by every Zeroconf instance, so a second scan
// started while the first is still walking SERVICE_TYPES would stomp it. Each run
// takes a token; an older run that finds itself superseded bows out and, crucially,
// does not stop the browser the newer run is using.
let generation = 0;

export function mdnsLookup(ip: string): string | null {
  return table.get(ip) ?? null;
}

/**
 * Walk SERVICE_TYPES, recording every IPv4 address that resolves to a hostname.
 * Fire alongside the IP sweep without awaiting; `onFound` reports names that
 * arrive after a device has already been enriched.
 */
export async function discoverMdnsNames(
  onFound: (ip: string, hostname: string) => void,
  isCancelled: () => boolean,
): Promise<void> {
  const run = ++generation;
  const superseded = () => run !== generation;
  table.clear();

  const zeroconf = new Zeroconf();
  zeroconf.on('error', () => {}); // EventEmitter throws on an unhandled 'error'

  zeroconf.on('resolved', service => {
    if (superseded()) return;
    const host = service.host?.replace(/\.$/, '');
    if (!host) return;
    for (const address of service.addresses ?? []) {
      if (!IPV4.test(address) || table.get(address) === host) continue;
      table.set(address, host);
      onFound(address, host);
    }
  });

  try {
    for (const type of SERVICE_TYPES) {
      if (isCancelled() || superseded()) break;
      zeroconf.scan(type, 'tcp', 'local.');
      await new Promise(resolve => setTimeout(resolve, SERVICE_DWELL_MS));
    }
  } finally {
    // Only the current run owns the native browser; a superseded run stopping it
    // would silently kill the scan that replaced it.
    if (!superseded()) zeroconf.stop();
    zeroconf.removeDeviceListeners();
  }
}
