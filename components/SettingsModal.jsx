import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Modal,
  Alert, Switch, StyleSheet, Platform,
} from 'react-native';
import { COLORS, FONTS, PRESET_COLORS } from '../lib/theme';
import {
  getAllCategories, saveCategory, deleteCategory, newCategory,
} from '../lib/storage';
import Constants from 'expo-constants';
import {
  requestNotificationPermissions, getPermissionStatus,
  refreshAllNotifications, getScheduledNotifications,
  cancelAllNotifications,
} from '../lib/notifications';

export default function SettingsModal({ onClose, onCategoriesChanged }) {
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null);
  const [notifStatus, setNotifStatus] = useState('undetermined');
  const [scheduledCount, setScheduledCount] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    refreshAll();
  }, []);

  const refreshAll = async () => {
    const [cats, status, sched] = await Promise.all([
      getAllCategories(),
      getPermissionStatus(),
      getScheduledNotifications(),
    ]);
    setCategories(cats);
    setNotifStatus(status);
    setScheduledCount(sched.length);
  };

  // ─── Categories ───
  const handleSaveCategory = async (cat) => {
    if (!cat.name.trim()) {
      Alert.alert('Name required');
      return;
    }
    await saveCategory(cat);
    setEditing(null);
    const fresh = await getAllCategories();
    setCategories(fresh);
    onCategoriesChanged?.();
  };

  const handleDeleteCategory = (cat) => {
    if (categories.length <= 1) {
      Alert.alert('Cannot delete', 'You must keep at least one category.');
      return;
    }
    const fallback = categories.find(c => c.id !== cat.id);
    Alert.alert(
      `Delete "${cat.name}"?`,
      `Events in this category will be moved to "${fallback.name}".`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteCategory(cat.id, fallback.id);
            const fresh = await getAllCategories();
            setCategories(fresh);
            onCategoriesChanged?.();
          },
        },
      ],
    );
  };

  // ─── Notifications ───
  const handleEnableNotifications = async () => {
    setBusy(true);
    const granted = await requestNotificationPermissions();
    if (granted) {
      const result = await refreshAllNotifications();
      setNotifStatus('granted');
      setScheduledCount(result.scheduled);
      Alert.alert(
        'Notifications enabled',
        `Scheduled ${result.scheduled} reminders for the next 90 days (${result.holidays} holiday · ${result.events} event).`,
      );
    } else {
      Alert.alert(
        'Permission denied',
        'You can enable notifications later in your phone settings.',
      );
    }
    setBusy(false);
  };

  const handleRescheduleNotifications = async () => {
    setBusy(true);
    const result = await refreshAllNotifications();
    setScheduledCount(result.scheduled);
    Alert.alert('Refreshed', `${result.scheduled} reminders scheduled.`);
    setBusy(false);
  };

  const handleCancelNotifications = async () => {
    Alert.alert(
      'Cancel all notifications?',
      'You can re-enable them at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Cancel All',
          style: 'destructive',
          onPress: async () => {
            await cancelAllNotifications();
            setScheduledCount(0);
          },
        },
      ],
    );
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>← BACK</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
          {/* ─── Notifications ─── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
            <Text style={styles.sectionDesc}>
              Holiday and remembrance reminders 14, 7, and 1 day before (at 9am),
              plus event reminders at the offset you choose — repeating events
              included, each occurrence scheduled individually.
            </Text>

            <View style={styles.statusRow}>
              <View>
                <Text style={styles.statusLabel}>STATUS</Text>
                <Text style={[
                  styles.statusValue,
                  { color: notifStatus === 'granted' ? COLORS.g2 : COLORS.textMuted },
                ]}>
                  {notifStatus === 'granted'
                    ? 'Enabled'
                    : notifStatus === 'denied'
                      ? 'Denied'
                      : notifStatus === 'unavailable'
                        ? 'Expo Go — session 4'
                        : 'Not yet enabled'}
                </Text>
              </View>
              {notifStatus === 'granted' && (
                <View>
                  <Text style={styles.statusLabel}>SCHEDULED</Text>
                  <Text style={styles.statusValue}>{scheduledCount}</Text>
                </View>
              )}
            </View>

            {notifStatus === 'unavailable' ? (
              <View style={[styles.secondaryBtn, { opacity: 0.6 }]}>
                <Text style={styles.secondaryBtnText}>
                  REQUIRES CUSTOM DEV BUILD
                </Text>
              </View>
            ) : notifStatus !== 'granted' ? (
              <TouchableOpacity
                onPress={handleEnableNotifications}
                disabled={busy}
                style={[styles.primaryBtn, busy && { opacity: 0.5 }]}
              >
                <Text style={styles.primaryBtnText}>
                  {busy ? 'WORKING…' : 'ENABLE NOTIFICATIONS'}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.btnRow}>
                <TouchableOpacity
                  onPress={handleRescheduleNotifications}
                  disabled={busy}
                  style={[styles.secondaryBtn, busy && { opacity: 0.5 }, { flex: 1 }]}
                >
                  <Text style={styles.secondaryBtnText}>REFRESH</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCancelNotifications}
                  disabled={busy}
                  style={[styles.dangerBtn, busy && { opacity: 0.5 }, { flex: 1 }]}
                >
                  <Text style={styles.dangerBtnText}>CANCEL ALL</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ─── Categories ─── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>CATEGORIES</Text>
            <Text style={styles.sectionDesc}>
              Tag events to keep them organized. Edit names and colors freely.
            </Text>

            {categories.map(cat => (
              <View key={cat.id} style={styles.categoryRow}>
                <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
                <Text style={styles.categoryRowName}>{cat.name}</Text>
                <TouchableOpacity
                  onPress={() => setEditing(cat)}
                  style={styles.iconBtn}
                >
                  <Text style={styles.iconBtnText}>EDIT</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeleteCategory(cat)}
                  style={styles.iconBtn}
                >
                  <Text style={[styles.iconBtnText, { color: COLORS.g3 }]}>DEL</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              onPress={() => setEditing(newCategory())}
              style={styles.addCatBtn}
            >
              <Text style={styles.addCatBtnText}>+ NEW CATEGORY</Text>
            </TouchableOpacity>
          </View>

          {/* ─── About ─── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ABOUT</Text>
            <Text style={styles.aboutText}>
              The Hearth — a perpetual 13-month Greek calendar honoring the Asatru year-wheel.
            </Text>
            <Text style={styles.aboutVersion}>
              v{Constants.expoConfig?.version ?? '1.1.0'} · {Platform.OS} · SDK 54
            </Text>
          </View>
        </ScrollView>

        {/* Category Editor */}
        {editing && (
          <CategoryEditor
            cat={editing}
            onSave={handleSaveCategory}
            onClose={() => setEditing(null)}
          />
        )}
      </View>
    </Modal>
  );
}

// ─── Category editor modal ───
function CategoryEditor({ cat, onSave, onClose }) {
  const [form, setForm] = useState(cat);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.editorRoot}>
        <View style={styles.editorBackdrop} onTouchEnd={onClose} />
        <View style={styles.editorSheet}>
          <Text style={styles.editorTitle}>
            {cat.name === 'New Category' ? 'New Category' : 'Edit Category'}
          </Text>

          <Text style={styles.fieldLabel}>NAME</Text>
          <TextInput
            value={form.name}
            onChangeText={(t) => setForm(f => ({ ...f, name: t }))}
            style={styles.editorInput}
            autoFocus
          />

          <Text style={styles.fieldLabel}>COLOR</Text>
          <View style={styles.colorGrid}>
            {PRESET_COLORS.map(color => (
              <TouchableOpacity
                key={color}
                onPress={() => setForm(f => ({ ...f, color }))}
                style={[
                  styles.colorSwatch,
                  {
                    backgroundColor: color,
                    borderColor: form.color === color ? COLORS.textPrimary : 'transparent',
                  },
                ]}
              />
            ))}
          </View>

          <View style={styles.editorBtnRow}>
            <TouchableOpacity onPress={onClose} style={[styles.secondaryBtn, { flex: 1 }]}>
              <Text style={styles.secondaryBtnText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onSave(form)}
              style={[styles.primaryBtn, { flex: 1 }]}
            >
              <Text style={styles.primaryBtnText}>SAVE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bgDeep,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: 50,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
    backgroundColor: COLORS.bgSurface,
  },
  headerBtn: { paddingVertical: 4, paddingHorizontal: 8, minWidth: 60 },
  headerBtnText: {
    fontSize: 11, fontFamily: FONTS.mono,
    color: COLORS.textMuted, letterSpacing: 1.5,
  },
  headerTitle: {
    fontSize: 18, fontFamily: FONTS.display,
    fontStyle: 'italic', color: COLORS.textPrimary,
  },

  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 60 },

  section: {
    marginBottom: 28,
    padding: 16,
    backgroundColor: COLORS.bgSurface,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    borderRadius: 6,
  },
  sectionTitle: {
    fontSize: 11, fontFamily: FONTS.mono,
    letterSpacing: 3, color: COLORS.accent,
    marginBottom: 6,
  },
  sectionDesc: {
    fontSize: 12, fontFamily: FONTS.body, fontStyle: 'italic',
    color: COLORS.textMuted, marginBottom: 14, lineHeight: 18,
  },

  statusRow: {
    flexDirection: 'row',
    gap: 32,
    marginBottom: 14,
  },
  statusLabel: {
    fontSize: 9, fontFamily: FONTS.mono,
    letterSpacing: 2, color: COLORS.textFaint,
    marginBottom: 2,
  },
  statusValue: {
    fontSize: 15, fontFamily: FONTS.display,
    color: COLORS.textPrimary,
  },

  primaryBtn: {
    backgroundColor: COLORS.accentDim,
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 11, fontFamily: FONTS.mono,
    letterSpacing: 2, color: COLORS.bgDeep, fontWeight: '700',
  },
  secondaryBtn: {
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    borderRadius: 4,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 11, fontFamily: FONTS.mono,
    letterSpacing: 2, color: COLORS.textSecondary,
  },
  dangerBtn: {
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.g3,
    borderRadius: 4,
    alignItems: 'center',
  },
  dangerBtnText: {
    fontSize: 11, fontFamily: FONTS.mono,
    letterSpacing: 2, color: COLORS.g3,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
  },

  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
  },
  categoryDot: {
    width: 14, height: 14,
    borderRadius: 7,
    marginRight: 12,
  },
  categoryRowName: {
    flex: 1,
    fontSize: 14, fontFamily: FONTS.body,
    color: COLORS.textPrimary,
  },
  iconBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  iconBtnText: {
    fontSize: 10, fontFamily: FONTS.mono,
    letterSpacing: 1.5, color: COLORS.textMuted,
  },

  addCatBtn: {
    marginTop: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.borderMid,
    borderRadius: 4,
    alignItems: 'center',
  },
  addCatBtnText: {
    fontSize: 11, fontFamily: FONTS.mono,
    letterSpacing: 2, color: COLORS.textMuted,
  },

  aboutText: {
    fontSize: 13, fontFamily: FONTS.body, fontStyle: 'italic',
    color: COLORS.textSecondary, lineHeight: 20, marginBottom: 8,
  },
  aboutVersion: {
    fontSize: 9, fontFamily: FONTS.mono,
    letterSpacing: 2, color: COLORS.textFaint,
  },

  // ─── Category editor inline modal ───
  editorRoot: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  editorBackdrop: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  editorSheet: {
    backgroundColor: COLORS.bgSurface,
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    borderRadius: 8,
    padding: 20,
  },
  editorTitle: {
    fontSize: 20, fontFamily: FONTS.display,
    fontStyle: 'italic', color: COLORS.textPrimary,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 10, fontFamily: FONTS.mono,
    letterSpacing: 2, color: COLORS.textMuted,
    marginBottom: 6, marginTop: 12,
  },
  editorInput: {
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.textPrimary,
    fontFamily: FONTS.body,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorSwatch: {
    width: 36, height: 36,
    borderRadius: 18,
    borderWidth: 2,
  },
  editorBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 20,
  },
});
