// DIAGNOSTIC BUILD — strips everything down to find the crashing import
import { Component } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

// Test each import one at a time and show which one crashes
const results = [];

const tryImport = (name, fn) => {
  try {
    const result = fn();
    results.push({ name, ok: true, val: typeof result });
  } catch (e) {
    results.push({ name, ok: false, err: String(e?.message || e).slice(0, 200) });
  }
};

tryImport('react-native-gesture-handler', () => require('react-native-gesture-handler'));
tryImport('react-native-safe-area-context', () => require('react-native-safe-area-context'));
tryImport('react-native-reanimated', () => require('react-native-reanimated'));
tryImport('expo-sqlite', () => require('expo-sqlite'));
tryImport('expo-font', () => require('expo-font'));
tryImport('expo-notifications', () => require('expo-notifications'));
tryImport('expo-device', () => require('expo-device'));
tryImport('expo-constants', () => require('expo-constants'));
tryImport('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage'));
tryImport('@react-native-community/datetimepicker', () => require('@react-native-community/datetimepicker'));
tryImport('lib/constants', () => require('./lib/constants'));
tryImport('lib/theme', () => require('./lib/theme'));
tryImport('lib/holidays', () => require('./lib/holidays'));
tryImport('lib/storage', () => require('./lib/storage'));
tryImport('lib/notifications', () => require('./lib/notifications'));
tryImport('components/SeasonalBanner', () => require('./components/SeasonalBanner'));
tryImport('components/MonthView', () => require('./components/MonthView'));
tryImport('components/AgendaView', () => require('./components/AgendaView'));
tryImport('components/DayDetail', () => require('./components/DayDetail'));
tryImport('components/EventModal', () => require('./components/EventModal'));
tryImport('components/SettingsModal', () => require('./components/SettingsModal'));

export default function App() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Diagnostic Build</Text>
      <Text style={styles.sub}>Testing all imports...</Text>
      <ScrollView style={styles.list}>
        {results.map((r, i) => (
          <View key={i} style={[styles.row, { backgroundColor: r.ok ? '#1a2e1a' : '#2e1a1a' }]}>
            <Text style={[styles.name, { color: r.ok ? '#5b8a72' : '#8b4a4a' }]}>
              {r.ok ? '✓' : '✗'} {r.name}
            </Text>
            {!r.ok && (
              <Text style={styles.err}>{r.err}</Text>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#16120e', paddingTop: 50, padding: 16 },
  title: { color: '#c9a84c', fontSize: 20, fontFamily: 'serif', marginBottom: 4 },
  sub: { color: '#8a7a62', fontSize: 12, fontFamily: 'monospace', marginBottom: 16, letterSpacing: 1 },
  list: { flex: 1 },
  row: { padding: 10, borderRadius: 4, marginBottom: 6, borderWidth: 1, borderColor: '#2e271a' },
  name: { fontSize: 13, fontFamily: 'monospace' },
  err: { fontSize: 11, fontFamily: 'monospace', color: '#c4b49a', marginTop: 4, opacity: 0.8 },
});
