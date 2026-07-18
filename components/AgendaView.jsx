import { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS } from '../lib/theme';
import { greekMonthDays, gregToGreek, fmtGreg } from '../lib/constants';
import { ASATRU_HOLIDAYS, remindersForDate } from '../lib/holidays';
import { categoryById } from '../lib/storage';
import { eventsByDateInRange } from '../lib/recurrence';
import { sortEventsByTime } from '../lib/dayLayout';

export default function AgendaView({
  monthId, year, themeColor, events, categories,
  onDayClick, onEventClick, today,
}) {
  const insets = useSafeAreaInsets();
  const days = useMemo(() => greekMonthDays(monthId, year), [monthId, year]);

  const agenda = useMemo(() => {
    const result = [];
    const evMap = eventsByDateInRange(events, days);
    for (const iso of days) {
      const greek = gregToGreek(iso);
      const holidays = ASATRU_HOLIDAYS.filter(
        h => h.greekMonth === greek?.monthId && h.greekDay === greek?.day
      );
      const reminders = remindersForDate(iso, year);
      const dayEvents = (evMap[iso] || []).map(x => x.event);

      if (holidays.length === 0 && reminders.length === 0 && dayEvents.length === 0) continue;

      const sortedHolidays = [...holidays].sort((a, b) =>
        (a.type === 'remembrance' ? 1 : 0) - (b.type === 'remembrance' ? 1 : 0)
      );
      const sortedEvents = sortEventsByTime(dayEvents);

      result.push({
        isoDate: iso, greek,
        holidays: sortedHolidays,
        reminders, events: sortedEvents,
        isToday: iso === today,
      });
    }
    return result;
  }, [days, year, events, today]);

  if (agenda.length === 0) {
    return (
      <View style={[styles.emptyContainer, { paddingBottom: insets.bottom + 60 }]}>
        <Text style={styles.emptyTitle}>Empty month.</Text>
        <Text style={styles.emptyBody}>
          No holidays, reminders, or events this month.{'\n'}
          Tap MONTH to add one.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]}
    >
      {agenda.map(entry => (
        <DayBlock
          key={entry.isoDate}
          entry={entry}
          themeColor={themeColor}
          categories={categories}
          onDayClick={onDayClick}
          onEventClick={onEventClick}
        />
      ))}
    </ScrollView>
  );
}

function DayBlock({ entry, themeColor, categories, onDayClick, onEventClick }) {
  const { isoDate, greek, holidays, reminders, events, isToday } = entry;

  return (
    <View style={[
      styles.dayBlock,
      { borderLeftColor: isToday ? themeColor : COLORS.borderSubtle },
    ]}>
      <TouchableOpacity onPress={() => onDayClick(isoDate)} style={styles.dayHeader}>
        <Text style={[
          styles.dayNumber,
          { color: isToday ? themeColor : COLORS.textPrimary },
        ]}>
          {greek?.letter}{greek?.day}
        </Text>
        <Text style={styles.dayGreg}>{fmtGreg(isoDate).toUpperCase()}</Text>
        {isToday && (
          <Text style={[styles.todayBadge, { color: themeColor }]}>TODAY</Text>
        )}
      </TouchableOpacity>

      <View style={styles.items}>
        {holidays.map(h => (
          <HolidayItem
            key={h.id}
            holiday={h}
            themeColor={themeColor}
            onPress={() => onDayClick(isoDate)}
          />
        ))}
        {reminders.map((r, i) => (
          <ReminderItem
            key={`${r.holiday.id}-${i}`}
            reminder={r}
            onPress={() => onDayClick(isoDate)}
          />
        ))}
        {events.map(evt => (
          <EventItem
            key={evt.id}
            event={evt}
            categories={categories}
            onPress={() => onEventClick(evt, isoDate)}
          />
        ))}
      </View>
    </View>
  );
}

function HolidayItem({ holiday, themeColor, onPress }) {
  const isRem = holiday.type === 'remembrance';
  const color = isRem ? 'rgba(180,150,110,0.7)' : themeColor;
  const bg = isRem ? 'rgba(120,100,80,0.06)' : `${themeColor}10`;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.itemBase, {
        backgroundColor: bg,
        borderLeftColor: color,
        borderColor: `${color}30`,
      }]}
    >
      <Text style={[
        styles.itemIcon,
        { color, fontFamily: isRem ? FONTS.mono : undefined },
      ]}>
        {holiday.symbol}
      </Text>
      <View style={styles.itemBody}>
        <Text style={[
          styles.itemTitle,
          { fontStyle: isRem ? 'italic' : 'normal' },
        ]}>
          {holiday.title}
        </Text>
      </View>
      <Text style={styles.itemBadge}>
        {isRem ? 'REMEMBER' : holiday.type.toUpperCase()}
      </Text>
    </TouchableOpacity>
  );
}

function ReminderItem({ reminder, onPress }) {
  const { holiday, daysAway } = reminder;
  const isRem = holiday.type === 'remembrance';
  const color = isRem ? 'rgba(180,150,110,0.6)' : COLORS.textMuted;
  const label = daysAway === 1 ? 'tomorrow' : `in ${daysAway} days`;

  return (
    <TouchableOpacity onPress={onPress} style={styles.reminderItem}>
      <Text style={[
        styles.itemIcon,
        { color, fontFamily: isRem ? FONTS.mono : undefined },
      ]}>
        {holiday.symbol}
      </Text>
      <View style={styles.itemBody}>
        <Text style={styles.reminderTitle} numberOfLines={1}>
          {holiday.title}
        </Text>
      </View>
      <Text style={styles.reminderBadge}>{label.toUpperCase()}</Text>
    </TouchableOpacity>
  );
}

function EventItem({ event, categories, onPress }) {
  const cat = categoryById(categories, event.categoryId);
  const color = cat?.color || COLORS.textMuted;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.itemBase, {
        backgroundColor: COLORS.bgElevated,
        borderLeftColor: color,
        borderColor: COLORS.borderSubtle,
      }]}
    >
      {!event.allDay && event.startTime ? (
        <Text style={styles.eventTime}>{event.startTime}</Text>
      ) : null}
      <View style={styles.itemBody}>
        <Text style={styles.eventTitle} numberOfLines={1}>
          {event.title || 'Untitled'}
        </Text>
        {event.location ? (
          <Text style={styles.eventLocation} numberOfLines={1}>
            {event.location}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.eventCat, { color }]}>
        {cat?.name?.split(' ')[0].toUpperCase() || event.categoryId}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 12 },

  emptyContainer: {
    paddingVertical: 60,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: FONTS.display,
    fontStyle: 'italic',
    color: COLORS.textMuted,
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 13,
    fontFamily: FONTS.body,
    color: COLORS.textFaint,
    textAlign: 'center',
    lineHeight: 20,
  },

  dayBlock: {
    marginBottom: 14,
    borderLeftWidth: 2,
    paddingLeft: 12,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingTop: 4,
    paddingBottom: 8,
  },
  dayNumber: {
    fontSize: 22,
    fontFamily: FONTS.display,
    fontWeight: '500',
    marginRight: 10,
  },
  dayGreg: {
    fontSize: 10,
    fontFamily: FONTS.mono,
    color: COLORS.textMuted,
    letterSpacing: 1,
  },
  todayBadge: {
    fontSize: 9,
    fontFamily: FONTS.mono,
    letterSpacing: 2,
    marginLeft: 'auto',
  },

  items: {},

  itemBase: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 3,
    marginBottom: 5,
  },
  itemIcon: {
    fontSize: 14,
    marginRight: 10,
  },
  itemBody: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontFamily: FONTS.display,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  itemBadge: {
    fontSize: 8,
    fontFamily: FONTS.mono,
    color: COLORS.textFaint,
    letterSpacing: 1.5,
    marginLeft: 8,
  },

  reminderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    borderStyle: 'dashed',
    borderRadius: 3,
    marginBottom: 5,
    opacity: 0.85,
  },
  reminderTitle: {
    fontSize: 12,
    fontFamily: FONTS.body,
    color: COLORS.textSecondary,
  },
  reminderBadge: {
    fontSize: 9,
    fontFamily: FONTS.mono,
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginLeft: 8,
  },

  eventTime: {
    fontSize: 10,
    fontFamily: FONTS.mono,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    minWidth: 40,
    marginRight: 8,
  },
  eventTitle: {
    fontSize: 13,
    fontFamily: FONTS.body,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  eventLocation: {
    fontSize: 9,
    fontFamily: FONTS.mono,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  eventCat: {
    fontSize: 9,
    fontFamily: FONTS.mono,
    letterSpacing: 1,
    marginLeft: 8,
  },
});
