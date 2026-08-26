import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Device } from '../utils/network';

interface Props {
  device: Device;
  isLocal: boolean;
}

export function DeviceCard({ device, isLocal }: Props) {
  const tags: string[] = [];
  if (isLocal) tags.push('This device');
  if (device.hasHttp) tags.push('HTTP');
  if (device.serverInfo) tags.push(device.serverInfo);

  return (
    <View style={[styles.card, isLocal && styles.localCard]}>
      <View style={[styles.dot, isLocal ? styles.localDot : styles.aliveDot]} />
      <View style={styles.body}>
        <Text style={styles.ip}>{device.ip}</Text>
        <Text style={styles.meta}>
          {tags.length > 0 ? tags.join(' · ') + '  ' : ''}
          <Text style={styles.responseTime}>{device.responseTime}ms</Text>
        </Text>
      </View>
      {device.hasHttp && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>HTTP</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  localCard: {
    borderColor: '#0891b2',
    backgroundColor: '#0c1929',
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 14,
  },
  aliveDot: {
    backgroundColor: '#10b981',
  },
  localDot: {
    backgroundColor: '#06b6d4',
  },
  body: {
    flex: 1,
  },
  ip: {
    color: '#f1f5f9',
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.3,
  },
  meta: {
    color: '#4b5563',
    fontSize: 11,
    marginTop: 3,
  },
  responseTime: {
    color: '#374151',
  },
  badge: {
    backgroundColor: '#064e3b',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: {
    color: '#34d399',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
