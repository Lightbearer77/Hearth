import { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Modal, StyleSheet } from 'react-native';
import { COLORS, FONTS } from '../lib/theme';
import { fmtGreek, fmtGreg } from '../lib/constants';
import { searchEvents } from '../lib/dayLayout';

export default function SearchOverlay({ events, categories, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchEvents(events, query).slice(0, 100), [events, query]);
  const catColor = (id) => categories.find(c => c.id === id)?.color || COLORS.accent;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.inputRow}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search events…"
              placeholderTextColor={COLORS.textFaint}
              autoFocus
              style={styles.input}
            />
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={results}
            keyExtractor={(e) => e.id}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 420 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.row} onPress={() => onPick(item)}>
                <View style={[styles.dot, { backgroundColor: catColor(item.categoryId) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.title || '(untitled)'}
                    {(item.recurrence || 'none') !== 'none' ? '  ↻' : ''}
                  </Text>
                  <Text style={styles.rowSub}>
                    {fmtGreek(item.date)} · {fmtGreg(item.date)}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {query.trim() ? 'No matching events.' : 'Search titles, notes, and locations.'}
              </Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    paddingTop: 70, paddingHorizontal: 16,
  },
  card: {
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1, borderColor: COLORS.borderMid, borderRadius: 8,
    padding: 12,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  input: {
    flex: 1,
    backgroundColor: COLORS.bgSurface,
    borderWidth: 1, borderColor: COLORS.borderMid, borderRadius: 4,
    paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 14, color: COLORS.textPrimary,
  },
  close: { fontSize: 16, color: COLORS.textMuted },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.bgSurface,
    borderWidth: 1, borderColor: COLORS.borderSubtle, borderRadius: 4,
    marginBottom: 5, paddingHorizontal: 10, paddingVertical: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowTitle: { fontSize: 13, fontFamily: FONTS.body, color: COLORS.textPrimary },
  rowSub: { fontSize: 9, fontFamily: FONTS.mono, letterSpacing: 0.5, color: COLORS.textMuted, marginTop: 2 },
  empty: { textAlign: 'center', color: COLORS.textFaint, fontSize: 12, paddingVertical: 18 },
});
