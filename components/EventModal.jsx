import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Modal,
  Switch, KeyboardAvoidingView, Platform, Alert, StyleSheet,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORS, FONTS } from '../lib/theme';
import { gregToGreek, fmtGregLong } from '../lib/constants';
import { categoryById } from '../lib/storage';
import { RECURRENCE_OPTIONS, CUSTOM_UNITS, recurrenceLabel } from '../lib/recurrence';

const REMINDER_OPTIONS = [
  { value: null, label: 'None' },
  { value: 0,    label: 'At start' },
  { value: 10,   label: '10 min before' },
  { value: 30,   label: '30 min before' },
  { value: 60,   label: '1 hour before' },
  { value: 1440, label: '1 day before' },
];

export default function EventModal({
  event, categories, onSave, onDelete, onClose, occurrenceMode = false,
}) {
  const [form, setForm] = useState(event);
  const [showEndDate, setShowEndDate] = useState(!!event.endDate);
  const [customOpen, setCustomOpen] = useState((event.recurrenceInterval || 1) > 1);
  const [datePicker, setDatePicker] = useState(null); // 'start' | 'end' | 'startTime' | 'endTime' | null
  const isNew = !event.title && event.createdAt && (Date.now() - event.createdAt < 5000);

  const update = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSave = () => {
    if (!form.title.trim()) {
      Alert.alert('Title required');
      return;
    }
    if (!form.date) {
      Alert.alert('Date required');
      return;
    }
    const finalForm = { ...form };
    finalForm.recurrenceInterval = Math.max(1, Math.floor(finalForm.recurrenceInterval || 1));
    if ((finalForm.recurrence || 'none') === 'none') finalForm.recurrenceInterval = 1;
    // Multi-day + repeat may combine: each occurrence keeps this duration.
    if (!showEndDate || !finalForm.endDate || finalForm.endDate < finalForm.date) {
      finalForm.endDate = '';
    }
    if (!Array.isArray(finalForm.reminders)) finalForm.reminders = [0];
    onSave(finalForm);
  };

  const handleDelete = () => {
    const repeating = (form.recurrence || 'none') !== 'none';
    Alert.alert(
      occurrenceMode ? 'Remove this occurrence?'
        : repeating ? 'Delete repeating event?' : 'Delete event?',
      occurrenceMode ? 'The rest of the series is unaffected.'
        : repeating
          ? 'This removes the entire series — every occurrence.'
          : 'This cannot be undone.',
      [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(form.id) },
    ]);
  };

  const handleDateChange = (which, _event, selected) => {
    // On Android the picker auto-dismisses on selection
    if (Platform.OS === 'android') setDatePicker(null);
    if (!selected) return;
    if (which === 'start' || which === 'end') {
      const iso = `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, '0')}-${String(selected.getDate()).padStart(2, '0')}`;
      update(which === 'start' ? 'date' : 'endDate', iso);
    } else {
      // Time picker
      const hh = String(selected.getHours()).padStart(2, '0');
      const mm = String(selected.getMinutes()).padStart(2, '0');
      const time = `${hh}:${mm}`;
      update(which === 'startTime' ? 'startTime' : 'endTime', time);
    }
  };

  const startGreek = form.date ? gregToGreek(form.date) : null;
  const endGreek = form.endDate ? gregToGreek(form.endDate) : null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: COLORS.bgDeep }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>← CANCEL</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {occurrenceMode ? 'Edit Occurrence' : isNew ? 'New Event' : 'Edit Event'}
          </Text>
          <TouchableOpacity onPress={handleSave} style={styles.headerBtn}>
            <Text style={[styles.headerBtnText, { color: COLORS.accent, fontWeight: '600' }]}>
              SAVE
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {/* Title */}
          <Field label="Title">
            <TextInput
              value={form.title}
              onChangeText={(t) => update('title', t)}
              placeholder="What is happening?"
              placeholderTextColor={COLORS.textFaint}
              autoFocus={isNew}
              style={styles.titleInput}
            />
          </Field>

          {/* Start Date */}
          <Field label={showEndDate ? "Start Date" : "Date"}>
            <TouchableOpacity
              onPress={() => setDatePicker('start')}
              style={styles.dateBtn}
            >
              <Text style={styles.dateBtnText}>
                {form.date ? fmtGregLong(form.date) : 'Pick a date'}
              </Text>
            </TouchableOpacity>
            {startGreek && (
              <Text style={styles.dateGreek}>
                {startGreek.isPlanningDay
                  ? 'Planning Day'
                  : `${startGreek.monthName} ${startGreek.day}`}
              </Text>
            )}
          </Field>

          {/* End Date toggle / picker */}
          {!showEndDate ? (
            <TouchableOpacity
              onPress={() => setShowEndDate(true)}
              style={styles.addEndDateBtn}
            >
              <Text style={styles.addEndDateText}>+ ADD END DATE</Text>
            </TouchableOpacity>
          ) : (
            <Field label="End Date">
              <TouchableOpacity
                onPress={() => setDatePicker('end')}
                style={styles.dateBtn}
              >
                <Text style={styles.dateBtnText}>
                  {form.endDate ? fmtGregLong(form.endDate) : 'Pick an end date'}
                </Text>
              </TouchableOpacity>
              <View style={styles.endDateRow}>
                {endGreek && (
                  <Text style={styles.dateGreek}>
                    {endGreek.isPlanningDay
                      ? 'Planning Day'
                      : `${endGreek.monthName} ${endGreek.day}`}
                  </Text>
                )}
                <TouchableOpacity
                  onPress={() => { setShowEndDate(false); update('endDate', ''); }}
                  style={{ marginLeft: 'auto' }}
                >
                  <Text style={styles.removeBtnText}>REMOVE</Text>
                </TouchableOpacity>
              </View>
            </Field>
          )}

          {/* Repeat */}
          {occurrenceMode ? (
            <Text style={styles.seriesHint}>
              Detached from its series — edits here affect only this occurrence.
            </Text>
          ) : (
          <Field label="Repeat">
            <View style={styles.categoryGrid}>
              {RECURRENCE_OPTIONS.map(opt => {
                const active = !customOpen
                  && (form.recurrence || 'none') === opt.id
                  && (form.recurrenceInterval || 1) <= 1;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={() => {
                      setCustomOpen(false);
                      setForm(f => ({ ...f, recurrence: opt.id, recurrenceInterval: 1 }));
                    }}
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor: active ? `${COLORS.accent}22` : COLORS.bgSurface,
                        borderColor: active ? COLORS.accent : COLORS.borderMid,
                      },
                    ]}
                  >
                    <Text style={[
                      styles.categoryName,
                      { color: active ? COLORS.accent : COLORS.textMuted },
                    ]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {(() => {
                const active = customOpen || (form.recurrenceInterval || 1) > 1;
                return (
                  <TouchableOpacity
                    onPress={() => {
                      setCustomOpen(true);
                      setForm(f => ({
                        ...f,
                        recurrence: (f.recurrence && f.recurrence !== 'none') ? f.recurrence : 'weekly',
                        recurrenceInterval: Math.max(2, Math.floor(f.recurrenceInterval || 1)),
                      }));
                    }}
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor: active ? `${COLORS.accent}22` : COLORS.bgSurface,
                        borderColor: active ? COLORS.accent : COLORS.borderMid,
                      },
                    ]}
                  >
                    <Text style={[
                      styles.categoryName,
                      { color: active ? COLORS.accent : COLORS.textMuted },
                    ]}>
                      Custom…
                    </Text>
                  </TouchableOpacity>
                );
              })()}
            </View>

            {(customOpen || (form.recurrenceInterval || 1) > 1) && (
              <View style={styles.customRow}>
                <Text style={styles.customEvery}>EVERY</Text>
                <TextInput
                  value={String(form.recurrenceInterval || 2)}
                  onChangeText={(t) => {
                    const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
                    update('recurrenceInterval', Number.isFinite(n) ? Math.min(999, Math.max(1, n)) : 1);
                  }}
                  keyboardType="number-pad"
                  maxLength={3}
                  style={styles.customInput}
                />
                <View style={styles.customUnits}>
                  {CUSTOM_UNITS.map(u => {
                    const active = (form.recurrence || 'weekly') === u.id;
                    return (
                      <TouchableOpacity
                        key={u.id}
                        onPress={() => update('recurrence', u.id)}
                        style={[
                          styles.categoryChip,
                          {
                            backgroundColor: active ? `${COLORS.accent}22` : COLORS.bgSurface,
                            borderColor: active ? COLORS.accent : COLORS.borderMid,
                          },
                        ]}
                      >
                        <Text style={[
                          styles.categoryName,
                          { color: active ? COLORS.accent : COLORS.textMuted },
                        ]}>
                          {(form.recurrenceInterval || 1) > 1 ? u.plural : u.singular}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {(form.recurrence || 'none') !== 'none' && (
              <Text style={styles.seriesHint}>
                {recurrenceLabel(form.recurrence, form.recurrenceInterval || 1)}
                {showEndDate && form.endDate ? ' — every occurrence spans the same number of days.' : ''} Series
                edits apply to every occurrence unless you edit a single one from its day.
              </Text>
            )}
          </Field>
          )}

          {/* Reminder */}
          <Field label="Reminder">
            <View style={styles.categoryGrid}>
              {REMINDER_OPTIONS.map(opt => {
                const cur = Array.isArray(form.reminders) ? form.reminders : [];
                const active = opt.value === null ? cur.length === 0 : cur.includes(opt.value);
                return (
                  <TouchableOpacity
                    key={String(opt.value)}
                    onPress={() => {
                      if (opt.value === null) { update('reminders', []); return; }
                      const cur = Array.isArray(form.reminders) ? form.reminders : [];
                      const next = cur.includes(opt.value)
                        ? cur.filter(v => v !== opt.value)
                        : [...cur, opt.value].sort((a, b) => a - b);
                      update('reminders', next);
                    }}
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor: active ? `${COLORS.accent}22` : COLORS.bgSurface,
                        borderColor: active ? COLORS.accent : COLORS.borderMid,
                      },
                    ]}
                  >
                    <Text style={[
                      styles.categoryName,
                      { color: active ? COLORS.accent : COLORS.textMuted },
                    ]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Field>

          {/* Time */}
          <Field label="Time">
            <View style={styles.allDayRow}>
              <Switch
                value={form.allDay}
                onValueChange={(v) => update('allDay', v)}
                trackColor={{ false: COLORS.borderMid, true: COLORS.accentDim }}
                thumbColor={form.allDay ? COLORS.accent : COLORS.textMuted}
              />
              <Text style={styles.allDayLabel}>All day</Text>
            </View>

            {!form.allDay && (
              <View style={styles.timeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subLabel}>START</Text>
                  <TouchableOpacity
                    onPress={() => setDatePicker('startTime')}
                    style={styles.dateBtn}
                  >
                    <Text style={styles.dateBtnText}>
                      {form.startTime || '--:--'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subLabel}>END</Text>
                  <TouchableOpacity
                    onPress={() => setDatePicker('endTime')}
                    style={styles.dateBtn}
                  >
                    <Text style={styles.dateBtnText}>
                      {form.endTime || '--:--'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </Field>

          {/* Location */}
          <Field label="Location">
            <TextInput
              value={form.location}
              onChangeText={(t) => update('location', t)}
              placeholder="Where?"
              placeholderTextColor={COLORS.textFaint}
              style={styles.input}
            />
          </Field>

          {/* Description */}
          <Field label="Description">
            <TextInput
              value={form.description}
              onChangeText={(t) => update('description', t)}
              placeholder="Notes, intentions, details..."
              placeholderTextColor={COLORS.textFaint}
              multiline
              numberOfLines={3}
              style={[styles.input, styles.textarea]}
            />
          </Field>

          {/* Category */}
          <Field label="Category">
            <View style={styles.categoryGrid}>
              {categories.map(cat => {
                const active = form.categoryId === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => update('categoryId', cat.id)}
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor: active ? `${cat.color}22` : COLORS.bgSurface,
                        borderColor: active ? cat.color : COLORS.borderMid,
                      },
                    ]}
                  >
                    <View style={[
                      styles.categoryDot,
                      { backgroundColor: cat.color, opacity: active ? 1 : 0.5 },
                    ]} />
                    <Text style={[
                      styles.categoryName,
                      { color: active ? cat.color : COLORS.textMuted },
                    ]}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Field>

          {/* Delete */}
          {!isNew && (
            <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
              <Text style={styles.deleteBtnText}>
                {occurrenceMode ? 'DELETE THIS OCCURRENCE' : 'DELETE EVENT'}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Date/Time pickers */}
        {datePicker === 'start' && (
          <DateTimePicker
            value={form.date ? new Date(form.date + 'T12:00:00') : new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(e, d) => handleDateChange('start', e, d)}
          />
        )}
        {datePicker === 'end' && (
          <DateTimePicker
            value={form.endDate ? new Date(form.endDate + 'T12:00:00') : new Date(form.date + 'T12:00:00')}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={form.date ? new Date(form.date + 'T12:00:00') : undefined}
            onChange={(e, d) => handleDateChange('end', e, d)}
          />
        )}
        {datePicker === 'startTime' && (
          <DateTimePicker
            value={timeToDate(form.startTime)}
            mode="time"
            is24Hour
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(e, d) => handleDateChange('startTime', e, d)}
          />
        )}
        {datePicker === 'endTime' && (
          <DateTimePicker
            value={timeToDate(form.endTime || form.startTime)}
            mode="time"
            is24Hour
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(e, d) => handleDateChange('endTime', e, d)}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function timeToDate(timeStr) {
  const d = new Date();
  if (timeStr && /^\d{2}:\d{2}$/.test(timeStr)) {
    const [h, m] = timeStr.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  } else {
    d.setHours(9, 0, 0, 0);
  }
  return d;
}

function Field({ label, children }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
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
  headerBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  headerBtnText: {
    fontSize: 11,
    fontFamily: FONTS.mono,
    color: COLORS.textMuted,
    letterSpacing: 1.5,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: FONTS.display,
    fontStyle: 'italic',
    color: COLORS.textSecondary,
  },

  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 60 },

  fieldLabel: {
    fontSize: 10,
    fontFamily: FONTS.mono,
    letterSpacing: 2,
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  subLabel: {
    fontSize: 9,
    fontFamily: FONTS.mono,
    letterSpacing: 2,
    color: COLORS.textMuted,
    marginBottom: 4,
  },

  input: {
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.textPrimary,
    fontFamily: FONTS.body,
  },
  titleInput: {
    backgroundColor: COLORS.bgSurface,
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 20,
    color: COLORS.textPrimary,
    fontFamily: FONTS.display,
  },
  textarea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },

  dateBtn: {
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dateBtnText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontFamily: FONTS.body,
  },
  dateGreek: {
    fontSize: 13,
    fontFamily: FONTS.display,
    fontStyle: 'italic',
    color: COLORS.textMuted,
    marginTop: 4,
    paddingLeft: 2,
  },

  addEndDateBtn: {
    paddingVertical: 4,
    paddingBottom: 16,
  },
  addEndDateText: {
    fontSize: 10,
    fontFamily: FONTS.mono,
    letterSpacing: 2,
    color: COLORS.textMuted,
  },
  endDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingLeft: 2,
  },
  removeBtnText: {
    fontSize: 9,
    fontFamily: FONTS.mono,
    letterSpacing: 1.5,
    color: COLORS.textFaint,
    padding: 4,
  },

  allDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  allDayLabel: {
    fontSize: 13,
    fontFamily: FONTS.body,
    color: COLORS.textSecondary,
    marginLeft: 10,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 8,
  },

  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 3,
    borderWidth: 1,
  },
  categoryDot: {
    width: 8, height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  categoryName: {
    fontSize: 10,
    fontFamily: FONTS.mono,
    letterSpacing: 1.2,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  customEvery: {
    fontSize: 10,
    fontFamily: FONTS.mono,
    letterSpacing: 2,
    color: COLORS.textMuted,
  },
  customInput: {
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: COLORS.textPrimary,
    fontFamily: FONTS.mono,
    minWidth: 52,
    textAlign: 'center',
  },
  customUnits: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  seriesHint: {
    fontSize: 11,
    fontFamily: FONTS.body,
    fontStyle: 'italic',
    color: COLORS.textMuted,
    marginTop: 8,
    paddingLeft: 2,
  },

  deleteBtn: {
    marginTop: 24,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.g3,
    borderRadius: 3,
    alignItems: 'center',
  },
  deleteBtnText: {
    fontSize: 10,
    fontFamily: FONTS.mono,
    letterSpacing: 2,
    color: COLORS.g3,
  },
});
