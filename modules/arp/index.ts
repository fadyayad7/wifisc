import { requireOptionalNativeModule } from 'expo-modules-core';

interface ArpNativeModule {
  /** ip → "aa:bb:cc:dd:ee:ff", for entries the kernel has a hardware address for */
  getArpTable(): Record<string, string>;
}

// Optional on purpose. The module ships for iOS only — Android has no equivalent,
// since /proc/net/arp stopped being readable by apps in Android 10 — so on every
// other platform this is null and lookups return null.
const Arp = requireOptionalNativeModule<ArpNativeModule>('Arp');

export const isArpAvailable = Arp !== null;

/**
 * MAC address for an IP, or null if the kernel has no entry with a resolved
 * hardware address. Call only after something has actually exchanged packets with
 * the host — the ARP cache holds recent neighbours, not the whole subnet.
 */
export function lookupMac(ip: string): string | null {
  // ponytail: re-reads the whole table per call. A sysctl is microseconds and a
  // scan looks up a few dozen hosts; add a cache only if profiling says so.
  return Arp?.getArpTable()[ip] ?? null;
}
