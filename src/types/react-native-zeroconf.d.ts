// react-native-zeroconf ships no type declarations. This covers only the surface
// src/utils/mdns.ts uses — widen it if you start using more of the library.
declare module 'react-native-zeroconf' {
  export interface ZeroconfService {
    name: string;
    fullName?: string;
    /** Bonjour hostname, e.g. "Fadys-MacBook-Pro.local." (trailing dot included) */
    host?: string;
    port?: number;
    /** Mixed IPv4/IPv6 literals */
    addresses?: string[];
    txt?: Record<string, string>;
  }

  export default class Zeroconf {
    constructor();
    scan(type?: string, protocol?: string, domain?: string): void;
    stop(): void;
    removeDeviceListeners(): void;
    on(event: 'resolved', listener: (service: ZeroconfService) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
  }
}
