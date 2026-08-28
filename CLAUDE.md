# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Expo SDK 51 / React Native app that discovers devices on the current WiFi subnet from an unprivileged mobile sandbox — no ICMP, no ARP. Discovery is raw TCP connect probing (`react-native-tcp-socket`); HTTP metadata still goes over `fetch()`.

## Commands

```bash
npm start          # Metro bundler (must attach to a dev build, NOT Expo Go)
npm run ios        # native iOS build (expo run:ios)
npm run android    # native Android build
npx tsc --noEmit   # typecheck — strict mode is on
```

No test suite, no linter, no CI. `npx tsc --noEmit` is the only automated check.

**Expo Go will not run this app.** `react-native-tcp-socket` is native code, so a
development build is required — `npm run ios` (or `npm run android`). After adding
or upgrading any native dep, run `pod install` in `ios/`. `tsc` cannot catch a
native linkage break; only a real build can.

`metro.config.js` is the bare Expo default and should stay that way. It previously carried a resolver `blockList` of `/node_modules\/.*\/node_modules\/.*/` which broke the iOS build — npm nests `@react-native/virtualized-lists` under `react-native/node_modules/`, and that pattern banned it. Nested deps are legal; don't re-add a blockList without an actual duplicate-module collision to point at.

## Architecture

One data flow, plus two side channels that run alongside it:

```
useNetworkScanner  →  probeAlive (phase 1)  →  enrichDevice (phase 2)  →  DeviceCard
     (state)            fast, batched            slow, per-host           (render)
                                                      ↑        ↑
                          mdns.ts (Bonjour browse) ───┘        └─── modules/arp (ARP cache)
```

- `src/utils/network.ts` — probing, classification, and the `Device` type. No React.
- `src/utils/mdns.ts` — Bonjour browse; owns the `ip → hostname` table.
- `modules/arp/` — local Expo module, iOS only; reads the kernel ARP cache for MACs.
- `src/hooks/useNetworkScanner.ts` — orchestration and the single `ScanState` object.
- `src/components/DeviceCard.tsx` — presentation only.
- `App.tsx` — layout, animations, banners.

### Two-phase scan

Phase 1 sweeps all 254 IPs in batches of 40 (`BATCH_SIZE`), awaiting each batch before the next. Phase 2 (`enrichDevice`) is fired **without** `await` — placeholder `Device` rows with `deviceType: 'Scanning…'` and `enriched: false` are pushed into state immediately, then replaced by IP match when enrichment resolves. This is why the UI fills in progressively; keep the placeholder/replace contract intact if you touch either side.

`stopScan` flips a `cancelRef` checked at each batch boundary. In-flight enrichment is not cancelled.

### TCP probing

`tcpProbe` is the single primitive both scan phases sit on: a raw
`react-native-tcp-socket` connect resolving to `'open'` | `'refused'` | `'timeout'`.
Open vs closed is now a fact from `connect()`, not an inference from elapsed time.

- **`probeAlive`** — connects to port 80. `timeout` = host down → `null`. `refused`
  (RST) = host **alive** with port 80 closed. `open` = alive, HTTP running.
- **`isPortOpen`** — `'open'` only.

`PORT_TIMEOUT_MS` (800) is a calibration constant, not a magic number — retune for
slow networks, don't remove it.

`PORT_CONCURRENCY` (5) caps in-flight probes **per host**. Every probe now holds a
real file descriptor, and enrichment runs for all alive hosts at once, so removing
this cap risks exhausting the process fd limit on a busy subnet. `fetch()` used to
pool connections for us; raw sockets do not.

Remaining blind spot: hosts that silently drop packets rather than sending RST are
indistinguishable from absent hosts, and still read as down.

### Device classification

`classifyDevice` is an ordered if-chain over open ports, `Server` header, and `<title>` — first match wins, so **order is semantics**. Notably AFP(548) and SSH+AirPlay(22+7000) are checked before AirPlay(7000) alone so Macs aren't classified as Apple TVs. Adding a rule means choosing where in the chain it goes.

Any new `DeviceType` union member must also get an entry in `TYPE_COLOR` in `DeviceCard.tsx` (a `Record<DeviceType, string>` — TS will catch a miss).

### Hostnames (mDNS)

`src/utils/mdns.ts` browses Bonjour and builds an `ip → hostname` table that
`enrichDevice` reads. This replaced a reverse-PTR lookup over `cloudflare-dns.com`,
which asked a public resolver about RFC1918 addresses and so answered `null` by
design — don't bring it back.

Three constraints shape the design:

- **`SERVICE_TYPES` must stay in sync with `NSBonjourServices` in `app.json`.** iOS 14+
  returns *zero* results for any service type not declared in Info.plist, silently.
  Adding a type to one list without the other looks like a network problem, not a bug.
- **One browse at a time.** `react-native-zeroconf`'s native `scan()` stops the previous
  browser, so types are walked in sequence, `SERVICE_DWELL_MS` each.
- **Bonjour APIs, not raw multicast.** Sending mDNS packets to 224.0.0.251 directly needs
  `com.apple.developer.networking.multicast`, which requires per-app approval from Apple.
  `NSNetServiceBrowser` needs only `NSBonjourServices` + local network permission.

Names arrive on their own clock, so a device can be enriched before its name resolves.
`useNetworkScanner` patches late arrivals into already-rendered rows.

### MAC addresses (ARP)

`modules/arp/` is a local Expo module reading the kernel ARP cache through the
`PF_ROUTE` sysctl — the same interface `arp -a` uses, and the only route to a
neighbour's MAC from a sandbox.

It lives in `modules/`, **not `ios/`** — `ios/` is gitignored and regenerated by
prebuild, which would erase it. Local modules autolink from `modules/`.

- **iOS only.** Android dropped app access to `/proc/net/arp` in Android 10, so the
  module declares `"platforms": ["ios"]` and `requireOptionalNativeModule` yields
  `null` everywhere else.
- **Read after probing, never before.** The cache holds hosts this device recently
  exchanged packets with; the port sweep is what puts them there. `enrichDevice` calls
  `lookupMac` last for that reason.
- **`macAddress` is `string | null` and often null.** Incomplete entries carry an
  all-zero hardware address and are reported as `null`. iOS may also withhold the
  table entirely — treat an empty result as normal and keep the UI degrading cleanly.
- Randomised MACs (default on modern phones and laptops per-SSID) make OUI vendor
  lookup unreliable. Routers, printers and IoT gear still use burned-in addresses.

### Deliberate limitations

- IPv4 /24 only: `parseSubnet` takes the first three octets and `generateIpRange` yields `.1`–`.254`.

### Platform config

Local network access depends on `app.json`: iOS `NSLocalNetworkUsageDescription` (permission prompt on first scan) and Android `usesCleartextTraffic: true` (plain-HTTP probes are blocked without it). Both are required for the app to function at all.

iOS `NSBonjourServices` lists every service type `src/utils/mdns.ts` browses. It is not optional and it is not a superset — an undeclared type returns nothing, with no error.
