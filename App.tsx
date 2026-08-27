import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Animated,
  Platform,
} from 'react-native';
import { useNetworkScanner } from './src/hooks/useNetworkScanner';
import { DeviceCard } from './src/components/DeviceCard';
import { lastOctet } from './src/utils/network';

export default function App() {
  const { state, startScan, stopScan } = useNetworkScanner();
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Animate progress bar width
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: state.progress,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [state.progress, progressAnim]);

  // Pulse the scan button while scanning
  useEffect(() => {
    if (state.isScanning) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.85, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [state.isScanning, pulseAnim]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const sortedDevices = [...state.devices].sort(
    (a, b) => lastOctet(a.ip) - lastOctet(b.ip)
  );

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0f1e" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>WiFi Scanner</Text>
        <Text style={styles.subtitle}>
          {state.subnet
            ? `${state.subnet}.0/24`
            : 'Discovers devices on your local network'}
        </Text>
      </View>

      {/* Progress section */}
      {(state.isScanning || state.progress > 0) && (
        <View style={styles.progressSection}>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
          </View>
          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>
              {state.isScanning
                ? `Scanning ${state.scanned}/${state.total}`
                : `Done — ${state.scanned} IPs checked`}
            </Text>
            <Text style={styles.progressFoundLabel}>
              {state.devices.length} found
            </Text>
          </View>
        </View>
      )}

      {/* Error banner */}
      {state.error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{state.error}</Text>
        </View>
      )}

      {/* iOS local network hint (shown before first scan) */}
      {Platform.OS === 'ios' && !state.localIp && !state.error && !state.isScanning && (
        <View style={styles.hintBanner}>
          <Text style={styles.hintText}>
            iOS will ask for Local Network permission on first scan. Tap Allow.
          </Text>
        </View>
      )}

      {/* MAC address sandbox note — shown once any scan has run */}
      {(state.scanned > 0 || state.devices.length > 0) && (
        <View style={styles.macNoteBanner}>
          <Text style={styles.macNoteText}>
            MAC addresses require native ARP access — unavailable in Expo Go sandbox
          </Text>
        </View>
      )}

      {/* Device list */}
      <FlatList
        data={sortedDevices}
        keyExtractor={item => item.ip}
        renderItem={({ item }) => (
          <DeviceCard device={item} isLocal={item.ip === state.localIp} />
        )}
        style={styles.list}
        contentContainerStyle={
          sortedDevices.length === 0 ? styles.listEmpty : styles.listContent
        }
        ListHeaderComponent={
          !state.isScanning && sortedDevices.length > 0 ? (
            <Text style={styles.sectionLabel}>
              {sortedDevices.length} device{sortedDevices.length !== 1 ? 's' : ''} online
            </Text>
          ) : null
        }
        ListEmptyComponent={
          !state.isScanning ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📡</Text>
              <Text style={styles.emptyTitle}>No devices yet</Text>
              <Text style={styles.emptyBody}>
                Tap "Start Scan" to ping all 254 IPs{'\n'}on your current WiFi subnet.
              </Text>
            </View>
          ) : null
        }
      />

      {/* Footer: scan / stop button */}
      <View style={styles.footer}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          {state.isScanning ? (
            <TouchableOpacity style={styles.stopButton} onPress={stopScan} activeOpacity={0.8}>
              <Text style={styles.buttonText}>Stop Scan</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.scanButton} onPress={startScan} activeOpacity={0.8}>
              <Text style={styles.buttonText}>Start Scan</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
        {state.localIp && (
          <Text style={styles.localIpLabel}>Your IP: {state.localIp}</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0f1e',
  },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f1f5f9',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
    color: '#374151',
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },

  // Progress
  progressSection: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#1e293b',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0891b2',
    borderRadius: 2,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  progressLabel: {
    color: '#4b5563',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  progressFoundLabel: {
    color: '#0891b2',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },

  // Banners
  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#1c0a0a',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 13,
    lineHeight: 18,
  },
  hintBanner: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#0c1f2e',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#164e63',
  },
  hintText: {
    color: '#7dd3fc',
    fontSize: 12,
    lineHeight: 17,
  },
  macNoteBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  macNoteText: {
    color: '#374151',
    fontSize: 11,
  },

  // List
  list: {
    flex: 1,
  },
  listContent: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  listEmpty: {
    flex: 1,
  },
  sectionLabel: {
    color: '#374151',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginHorizontal: 16,
    marginBottom: 10,
    marginTop: 4,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 14,
    color: '#1f2937',
    textAlign: 'center',
    lineHeight: 21,
  },

  // Footer
  footer: {
    padding: 20,
    paddingBottom: Platform.OS === 'android' ? 24 : 20,
    gap: 10,
  },
  scanButton: {
    backgroundColor: '#0e7490',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  stopButton: {
    backgroundColor: '#450a0a',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  buttonText: {
    color: '#f1f5f9',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  localIpLabel: {
    color: '#1f2937',
    fontSize: 12,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
