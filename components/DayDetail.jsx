import { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal, Pressable, StyleSheet,
  TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { COLORS, FONTS } from '../lib/theme';
import { gregToGreek, fmtGregLong, fmtGreek, SEASONAL_THEMES } from '../lib/constants';
import { ASATRU_HOLIDAYS, remindersForDate } from '../lib/holidays';
import { categoryById } from '../lib/storage';
import { occursOn } from '../lib/recurrence';
import { sortEventsByTime } from '../lib/dayLayout';
import { tasksForDate, relativeAge } from '../lib/tasks';
import { openForge } from '../lib/openForge';

export default function DayDetail({
  isoDate, events, categories, onClose, onAdd, onEdit,
  tasks = [], todayIso, forge,
  onAddTask, onToggleTask, onToggleCarry, onDeleteTask, onRefreshForge,
}) {
  const [draft, setDraft] = useState('');
  const [draftCarry, setDraftCarry] = useState(true);

  const dayTasks = tasksForDate(tasks, isoDate, todayIso);
  const isToday = isoDate === todayIso;

  const submitDraft = () => {
    const title = draft.trim();
    if (!title) return;
    onAddTask(title, draftCarry);
    setDraft('');
  };

  const confirmDelete = (task) => {
    Alert.alert('Delete task?', task.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDeleteTask(task) },
    ]);
  };

  const greek = gregToGreek(isoDate);
  const year = parseInt(isoDate.slice(0, 4), 10);
  const holidays = greek ? ASATRU_HOLIDAYS.filter(
    h => h.greekMonth === greek.monthId && h.greekDay === greek.day
  ) : [];
  const reminders = remindersForDate(isoDate, year);
  const dayEvents = sortEventsByTime(events.filter(e => occursOn(e, isoDate)));
  const themeColor = greek
    ? (SEASONAL_THEMES[greek.monthId]?.color || COLORS.accent)
    : COLORS.accent;

  const festivalHolidays = holidays.filter(h => h.type !== 'remembrance');
  const remembranceHolidays = holidays.filter(h => h.type === 'remembrance');

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* 'height' on Android: undefined makes KeyboardAvoidingView inert there
          (same bug as EventModal, fixed v1.7.2). */}
      <KeyboardAvoidingView
        style={styles.modalRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { borderTopColor: themeColor }]}>
          {/* Drag handle */}
          <View style={styles.dragHandleArea}>
            <View style={styles.dragHandleBar} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.dateTitle, { color: themeColor }]}>
                {greek?.letter}{greek?.day}
              </Text>
              <Text style={styles.dateSubtitle}>
                {greek?.isPlanningDay
                  ? 'Planning Day'
                  : `${greek?.monthName} ${greek?.day}`}
              </Text>
              <Text style={styles.dateGreg}>{fmtGregLong(isoDate)}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>×</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            {festivalHolidays.length > 0 && (
              <View style={styles.section}>
                {festivalHolidays.map(h => (
                  <HolidayCard key={h.id} holiday={h} themeColor={themeColor} />
                ))}
              </View>
            )}

            {remembranceHolidays.length > 0 && (
              <View style={styles.section}>
                <SectionDivider>DAY OF REMEMBRANCE</SectionDivider>
                {remembranceHolidays.map(h => (
                  <RemembranceCard key={h.id} holiday={h} />
                ))}
              </View>
            )}

            {reminders.length > 0 && (
              <View style={styles.section}>
                <SectionDivider>UPCOMING</SectionDivider>
                {reminders.map((r, i) => (
                  <ReminderRow key={`${r.holiday.id}-${i}`} reminder={r} />
                ))}
              </View>
            )}

            {dayEvents.length > 0 && (
              <View style={styles.section}>
                <SectionDivider>EVENTS</SectionDivider>
                {dayEvents.map(evt => (
                  <EventRow
                    key={evt.id}
                    event={evt}
                    categories={categories}
                    onPress={() => onEdit(evt, isoDate)}
                  />
                ))}
              </View>
            )}

            {dayEvents.length === 0 && holidays.length === 0 && reminders.length === 0
              && dayTasks.length === 0 && (
              <Text style={styles.emptyText}>No events.</Text>
            )}

            <View style={styles.section}>
              <SectionDivider>TASKS</SectionDivider>
              {dayTasks.map(({ task, done, dayNumber }) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  done={done}
                  dayNumber={dayNumber}
                  themeColor={themeColor}
                  onToggle={() => onToggleTask(task, isoDate)}
                  onToggleCarry={() => onToggleCarry(task)}
                  onDelete={() => confirmDelete(task)}
                />
              ))}
              <View style={styles.taskAddRow}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  onSubmitEditing={submitDraft}
                  blurOnSubmit={false}
                  returnKeyType="done"
                  placeholder="Add a task…"
                  placeholderTextColor={COLORS.textFaint}
                  style={styles.taskInput}
                />
                <TouchableOpacity
                  onPress={() => setDraftCarry(c => !c)}
                  style={[
                    styles.carryChip,
                    draftCarry && { borderColor: themeColor, backgroundColor: `${themeColor}18` },
                  ]}
                >
                  <Text style={[
                    styles.carryChipText,
                    draftCarry && { color: themeColor },
                  ]}>
                    ↻ CARRY
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={submitDraft}
                  disabled={!draft.trim()}
                  style={[styles.taskAddBtn, { borderColor: themeColor, opacity: draft.trim() ? 1 : 0.4 }]}
                >
                  <Text style={[styles.taskAddBtnText, { color: themeColor }]}>ADD</Text>
                </TouchableOpacity>
              </View>
            </View>

            {isToday && forge && (
              <View style={styles.section}>
                <SectionDivider>
                  {forge.picks.length > 0
                    ? `THIS WEEK · FORGE (${forge.picks.length})`
                    : 'THIS WEEK · FORGE'}
                </SectionDivider>
                {forge.picks.map(p => (
                  <ForgePickRow key={p.id} pick={p} onPress={openForge} />
                ))}
                {forge.picks.length === 0 && (
                  <Text style={styles.forgeEmpty}>
                    {forge.fetchedAt
                      ? 'Nothing is In Progress in the Forge. Move this week’s picks there, then Push.'
                      : forge.loading ? 'Loading…' : 'Forge picks have not loaded yet.'}
                  </Text>
                )}
                <View style={styles.forgeMeta}>
                  <Text style={styles.forgeMetaText}>
                    {forge.pushedAt
                      ? `FORGE PUSH ${relativeAge(forge.pushedAt, Date.now()).toUpperCase()}`
                      : 'NO PUSH TIME'}
                    {forge.error ? ' · OFFLINE, CACHED' : ''}
                  </Text>
                  <TouchableOpacity onPress={onRefreshForge} disabled={forge.loading}>
                    <Text style={[styles.forgeRefresh, { color: themeColor }]}>
                      {forge.loading ? 'REFRESHING…' : '↻ REFRESH'}
                    </Text>
                  </TouchableOpacity>
                </View>
                {forge.picks.length > 0 && (
                  <Text style={styles.forgeHint}>
                    Tap a pick to open the Forge and check it off there.
                  </Text>
                )}
              </View>
            )}

            <TouchableOpacity
              onPress={onAdd}
              style={[styles.addBtn, { borderColor: themeColor }]}
            >
              <Text style={[styles.addBtnText, { color: themeColor }]}>
                + ADD EVENT
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SectionDivider({ children }) {
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>{children}</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

function HolidayCard({ holiday, themeColor }) {
  return (
    <View style={[styles.holidayCard, {
      backgroundColor: `${themeColor}10`,
      borderColor: `${themeColor}38`,
    }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardSymbol}>{holiday.symbol}</Text>
        <Text style={[styles.cardTitle, { color: themeColor }]}>
          {holiday.title}
        </Text>
      </View>
      <Text style={styles.cardDesc}>{holiday.description}</Text>
    </View>
  );
}

function RemembranceCard({ holiday }) {
  return (
    <View style={styles.remCard}>
      <View style={styles.cardHeader}>
        <Text style={styles.remSymbol}>{holiday.symbol}</Text>
        <Text style={styles.remTitle}>{holiday.title}</Text>
      </View>
      <Text style={styles.cardDesc}>{holiday.description}</Text>
    </View>
  );
}

function ReminderRow({ reminder }) {
  const { holiday, daysAway, holidayDate } = reminder;
  const isRem = holiday.type === 'remembrance';
  const label = daysAway === 1 ? 'tomorrow' : `in ${daysAway} days`;
  const accent = isRem ? 'rgba(180,150,110,0.7)' : COLORS.accentDim;

  return (
    <View style={[styles.reminderRow, { borderLeftColor: accent }]}>
      <Text style={[
        styles.reminderIcon,
        { color: accent, fontFamily: isRem ? FONTS.mono : undefined },
      ]}>
        {holiday.symbol}
      </Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.reminderRowTitle}>{holiday.title}</Text>
        <Text style={styles.reminderRowSub}>
          {label.toUpperCase()} · {fmtGreek(holidayDate)}
        </Text>
      </View>
    </View>
  );
}

function EventRow({ event, categories, onPress }) {
  const cat = categoryById(categories, event.categoryId);
  const color = cat?.color || COLORS.textMuted;

  return (
    <TouchableOpacity onPress={onPress} style={[
      styles.eventRow,
      { borderLeftColor: color },
    ]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.eventRowTitle}>{event.title || 'Untitled'}</Text>
        {(event.startTime || event.location || (event.recurrence && event.recurrence !== 'none')) && (
          <Text style={styles.eventRowSub}>
            {event.allDay
              ? 'All day'
              : (event.startTime + (event.endTime ? ` – ${event.endTime}` : ''))}
            {event.location && ` · ${event.location}`}
            {event.recurrence && event.recurrence !== 'none' ? ' · ↻ repeats' : ''}
          </Text>
        )}
      </View>
      <Text style={[styles.eventRowCat, { color }]}>
        {cat?.name?.split(' ')[0].toUpperCase() || event.categoryId}
      </Text>
    </TouchableOpacity>
  );
}

function TaskRow({ task, done, dayNumber, themeColor, onToggle, onToggleCarry, onDelete }) {
  // Sub-line: how long a carried task has been riding, or that it will carry.
  let sub = '';
  if (dayNumber > 1) sub = `DAY ${dayNumber} · CARRIED`;
  else if (task.carryOver) sub = '↻ CARRIES UNTIL DONE';

  return (
    <View style={[styles.taskRow, done && styles.taskRowDone]}>
      <TouchableOpacity
        onPress={onToggle}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={[
          styles.checkbox,
          { borderColor: done ? themeColor : COLORS.borderStrong },
          done && { backgroundColor: themeColor },
        ]}
      >
        {done && <Text style={styles.checkmark}>✓</Text>}
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={[styles.taskTitle, done && styles.taskTitleDone]}>
          {task.title}
        </Text>
        {!!sub && (
          <Text style={[styles.taskSub, dayNumber > 1 && !done && { color: themeColor }]}>
            {sub}
          </Text>
        )}
      </View>
      <TouchableOpacity
        onPress={onToggleCarry}
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        style={styles.taskIconBtn}
      >
        <Text style={[
          styles.taskIcon,
          task.carryOver && { color: themeColor },
        ]}>
          ↻
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onDelete}
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        style={styles.taskIconBtn}
      >
        <Text style={styles.taskIcon}>×</Text>
      </TouchableOpacity>
    </View>
  );
}

const GOAL_COLORS = { G1: COLORS.g1, G2: COLORS.g2, G3: COLORS.g3, G4: COLORS.g4 };

function ForgePickRow({ pick, onPress }) {
  const color = GOAL_COLORS[pick.goal] || COLORS.textMuted;
  const due = pick.dueDate ? fmtGreek(pick.dueDate) : '';
  const sub = [pick.goal, pick.section, due && `due ${due}`].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity onPress={onPress} style={[styles.eventRow, { borderLeftColor: color }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.eventRowTitle}>{pick.name}</Text>
        {!!sub && <Text style={styles.eventRowSub}>{sub}</Text>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: COLORS.bgSurface,
    borderTopWidth: 2,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    maxHeight: '80%',
    minHeight: '40%',
  },
  dragHandleArea: {
    paddingTop: 10,
    paddingBottom: 6,
    alignItems: 'center',
  },
  dragHandleBar: {
    width: 36, height: 4,
    backgroundColor: COLORS.borderStrong,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
  },
  dateTitle: {
    fontSize: 28,
    fontFamily: FONTS.display,
    fontWeight: '500',
    lineHeight: 32,
  },
  dateSubtitle: {
    fontSize: 13,
    fontFamily: FONTS.body,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  dateGreg: {
    fontSize: 10,
    fontFamily: FONTS.mono,
    color: COLORS.textFaint,
    marginTop: 2,
    letterSpacing: 1,
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    color: COLORS.textMuted,
    fontSize: 28,
    lineHeight: 28,
  },

  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 40 },

  section: { marginBottom: 8 },

  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.borderSubtle,
  },
  dividerText: {
    fontSize: 9,
    fontFamily: FONTS.mono,
    color: COLORS.textFaint,
    letterSpacing: 3,
    marginHorizontal: 10,
  },

  holidayCard: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 4,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardSymbol: {
    fontSize: 16,
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 17,
    fontFamily: FONTS.display,
    fontWeight: '500',
    flex: 1,
  },
  cardDesc: {
    fontSize: 13,
    fontFamily: FONTS.body,
    color: COLORS.textSecondary,
    lineHeight: 19,
  },

  remCard: {
    padding: 12,
    backgroundColor: 'rgba(120,100,80,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(120,100,80,0.28)',
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(180,150,110,0.55)',
    borderRadius: 4,
    marginBottom: 10,
  },
  remSymbol: {
    fontSize: 18,
    fontFamily: FONTS.mono,
    color: COLORS.textSecondary,
    marginRight: 10,
  },
  remTitle: {
    fontSize: 16,
    fontFamily: FONTS.display,
    fontWeight: '500',
    fontStyle: 'italic',
    color: COLORS.textPrimary,
    flex: 1,
  },

  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    paddingLeft: 12,
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    borderLeftWidth: 2,
    borderRadius: 3,
    marginBottom: 6,
  },
  reminderIcon: {
    fontSize: 14,
    marginRight: 10,
  },
  reminderRowTitle: {
    fontSize: 13,
    fontFamily: FONTS.body,
    color: COLORS.textPrimary,
  },
  reminderRowSub: {
    fontSize: 9,
    fontFamily: FONTS.mono,
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginTop: 1,
  },

  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 10,
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    borderLeftWidth: 3,
    borderRadius: 3,
    marginBottom: 6,
  },
  eventRowTitle: {
    fontSize: 14,
    fontFamily: FONTS.body,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  eventRowSub: {
    fontSize: 10,
    fontFamily: FONTS.mono,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  eventRowCat: {
    fontSize: 9,
    fontFamily: FONTS.mono,
    letterSpacing: 1,
    marginLeft: 8,
  },

  emptyText: {
    paddingVertical: 16,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: FONTS.body,
    fontStyle: 'italic',
    color: COLORS.textFaint,
  },

  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    borderRadius: 3,
    marginBottom: 6,
  },
  taskRowDone: { opacity: 0.55 },
  checkbox: {
    width: 22, height: 22,
    borderWidth: 1.5,
    borderRadius: 4,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: COLORS.bgDeep,
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '700',
  },
  taskTitle: {
    fontSize: 14,
    fontFamily: FONTS.body,
    color: COLORS.textPrimary,
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
    color: COLORS.textMuted,
  },
  taskSub: {
    fontSize: 9,
    fontFamily: FONTS.mono,
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginTop: 2,
  },
  taskIconBtn: { paddingHorizontal: 8 },
  taskIcon: {
    fontSize: 20,
    lineHeight: 22,
    color: COLORS.textFaint,
  },
  taskAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  taskInput: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    fontFamily: FONTS.body,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.bgDeep,
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    borderRadius: 3,
  },
  carryChip: {
    marginLeft: 6,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    borderRadius: 3,
  },
  carryChipText: {
    fontSize: 9,
    fontFamily: FONTS.mono,
    letterSpacing: 1,
    color: COLORS.textMuted,
  },
  taskAddBtn: {
    marginLeft: 6,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 3,
  },
  taskAddBtnText: {
    fontSize: 10,
    fontFamily: FONTS.mono,
    letterSpacing: 2,
  },

  forgeEmpty: {
    paddingVertical: 8,
    fontSize: 12,
    fontFamily: FONTS.body,
    fontStyle: 'italic',
    color: COLORS.textFaint,
  },
  forgeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  forgeMetaText: {
    fontSize: 9,
    fontFamily: FONTS.mono,
    letterSpacing: 1,
    color: COLORS.textFaint,
  },
  forgeRefresh: {
    fontSize: 9,
    fontFamily: FONTS.mono,
    letterSpacing: 1,
    padding: 4,
  },
  forgeHint: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: FONTS.body,
    fontStyle: 'italic',
    color: COLORS.textFaint,
  },

  addBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 4,
    alignItems: 'center',
  },
  addBtnText: {
    fontSize: 11,
    fontFamily: FONTS.mono,
    letterSpacing: 3,
  },
});
