import { useState, useCallback, useRef } from 'react';
import * as Network from 'expo-network';
import { Device, probeIp, parseSubnet, generateIpRange } from '../utils/network';

const BATCH_SIZE = 40;
const PROBE_TIMEOUT_MS = 1500;

export interface ScanState {
  devices: Device[];
  isScanning: boolean;
  progress: number;
  scanned: number;
  total: number;
  localIp: string | null;
  subnet: string | null;
  error: string | null;
}

const initialState: ScanState = {
  devices: [],
  isScanning: false,
  progress: 0,
  scanned: 0,
  total: 254,
  localIp: null,
  subnet: null,
  error: null,
};

export function useNetworkScanner() {
  const [state, setState] = useState<ScanState>(initialState);
  const cancelRef = useRef(false);

  const startScan = useCallback(async () => {
    cancelRef.current = false;
    setState({ ...initialState, isScanning: true });

    try {
      const networkState = await Network.getNetworkStateAsync();
      const ip = await Network.getIpAddressAsync();

      // Reject loopback / unassigned. Accept WiFi, Ethernet, and UNKNOWN
      // (iOS Simulator reports UNKNOWN even though it shares the Mac's WiFi).
      if (!ip || ip === '0.0.0.0' || ip === '127.0.0.1') {
        setState(s => ({
          ...s,
          isScanning: false,
          error: 'No local network IP found. Make sure you are connected to WiFi.',
        }));
        return;
      }

      const { CELLULAR, NONE } = Network.NetworkStateType;
      if (networkState.type === CELLULAR || networkState.type === NONE) {
        setState(s => ({
          ...s,
          isScanning: false,
          localIp: ip,
          error: 'Connected via cellular — local network scan requires WiFi.',
        }));
        return;
      }

      const subnet = parseSubnet(ip);
      const allIps = generateIpRange(subnet);

      setState(s => ({ ...s, localIp: ip, subnet, total: allIps.length }));

      let scanned = 0;

      for (let i = 0; i < allIps.length; i += BATCH_SIZE) {
        if (cancelRef.current) break;

        const batch = allIps.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(batchIp => probeIp(batchIp, PROBE_TIMEOUT_MS))
        );

        const found = results.filter((r): r is Device => r !== null);
        scanned += batch.length;

        setState(s => ({
          ...s,
          devices: found.length > 0 ? [...s.devices, ...found] : s.devices,
          scanned,
          progress: scanned / allIps.length,
        }));
      }
    } catch (e: any) {
      setState(s => ({ ...s, error: e?.message ?? 'Scan failed unexpectedly.' }));
    } finally {
      setState(s => ({ ...s, isScanning: false, progress: 1 }));
    }
  }, []);

  const stopScan = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return { state, startScan, stopScan };
}
