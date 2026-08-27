import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Device, DeviceType, ServicePort } from '../utils/network';

// ── Device type → accent colour ───────────────────────────────────────────────

const TYPE_COLOR: Record<DeviceType, string> = {
  'Router':         '#7c3aed',
  'Mac':            '#1d4ed8',
  'Windows PC':     '#0369a1',
  'Linux Server':   '#065f46',
  'NAS':            '#92400e',
  'Printer':        '#9f1239',
  'IP Camera':      '#7c3aed',
  'Apple TV':       '#1d4ed8',
  'Plex Server':    '#b45309',
  'IoT Device':     '#065f46',
  'Network Device': '#374151',
  'Unknown':        '#374151',
  'Scanning…':      '#374151',
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  device: Device;
  isLocal: boolean;
}

export function DeviceCard({ device, isLocal }: Props) {
  const accent = isLocal ? '#0891b2' : (TYPE_COLOR[device.deviceType] ?? '#374151');
  const accentFaint = accent + '22';
  const accentBorder = accent + '55';

  return (
    <View style={[styles.card, { borderColor: accentBorder }]}>

      {/* ── Row 1: dot · IP · type badge · latency ── */}
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: isLocal ? '#06b6d4' : '#10b981' }]} />

        <Text style={styles.ip} numberOfLines={1}>{device.ip}</Text>

        <View style={[styles.typeBadge, { backgroundColor: accentFaint, borderColor: accentBorder }]}>
          {device.enriched ? (
            <Text style={[styles.typeText, { color: accent === '#374151' ? '#6b7280' : accent }]}>
              {device.deviceType}
            </Text>
          ) : (
            <ActivityIndicator size="small" color="#4b5563" style={styles.spinner} />
          )}
        </View>

        <Text style={styles.latency}>{device.responseTime}ms</Text>
      </View>

      {/* ── Row 2: hostname ── */}
      {device.hostname ? (
        <Text style={styles.hostname} numberOfLines={1}>{device.hostname}</Text>
      ) : device.enriched ? (
        <Text style={styles.hostnameAbsent}>hostname not resolved</Text>
      ) : null}

      {/* ── Row 3: server + page title ── */}
      {device.serverInfo ? (
        <Text style={styles.meta} numberOfLines={1}>
          <Text style={styles.metaLabel}>Server  </Text>
          {device.serverInfo}
        </Text>
      ) : null}
      {device.httpTitle ? (
        <Text style={styles.meta} numberOfLines={1}>
          <Text style={styles.metaLabel}>Title   </Text>
          {device.httpTitle}
        </Text>
      ) : null}

      {/* ── Row 4: open ports ── */}
      {device.openPorts.length > 0 ? (
        <View style={styles.portsRow}>
          {device.openPorts.map(({ port, name }: ServicePort) => (
            <View key={port} style={styles.portChip}>
              <Text style={styles.portText}>{name}</Text>
            </View>
          ))}
        </View>
      ) : device.enriched ? (
        <Text style={styles.hostnameAbsent}>no open ports detected</Text>
      ) : null}

      {/* ── Row 5: MAC (always unavailable in sandbox) ── */}
      <Text style={styles.macRow}>
        <Text style={styles.metaLabel}>MAC     </Text>
        <Text style={styles.macValue}>— (sandbox restriction)</Text>
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111827',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    gap: 6,
  },

  // Row 1
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  ip: {
    flex: 1,
    color: '#f1f5f9',
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.2,
  },
  typeBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  spinner: {
    transform: [{ scale: 0.65 }],
  },
  latency: {
    color: '#4b5563',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    minWidth: 36,
    textAlign: 'right',
  },

  // Row 2
  hostname: {
    color: '#38bdf8',
    fontSize: 12,
    marginLeft: 17,
  },
  hostnameAbsent: {
    color: '#1f2937',
    fontSize: 11,
    marginLeft: 17,
    fontStyle: 'italic',
  },

  // Row 3
  meta: {
    color: '#6b7280',
    fontSize: 12,
    marginLeft: 17,
    fontVariant: ['tabular-nums'],
  },
  metaLabel: {
    color: '#374151',
    fontFamily: 'monospace',
  },

  // Row 4
  portsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginLeft: 17,
    marginTop: 2,
  },
  portChip: {
    backgroundColor: '#1f2937',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#374151',
  },
  portText: {
    color: '#9ca3af',
    fontSize: 10,
    fontFamily: 'monospace',
  },

  // Row 5
  macRow: {
    color: '#374151',
    fontSize: 11,
    marginLeft: 17,
    fontVariant: ['tabular-nums'],
  },
  macValue: {
    color: '#1f2937',
    fontStyle: 'italic',
  },
});
