import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS } from '../lib/theme';
import {
  greekMonthDays, gregToGreek, dayOfWeek,
  prevGreekMonth, nextGreekMonth,
} from '../lib/constants';
import { ASATRU_HOLIDAYS, remindersForDate } from '../lib/holidays';
import { eventsForDate, categoryById } from '../lib/storage';

const SCREEN_W = Dimensions.get('window').width;
const CELL_GAP = 2;
const HORIZONTAL_PADDING = 8;
const CELL_SIZE = (SCREEN_W - HORIZONTAL_PADDING * 2 - CELL_GAP * 6) / 7;

export default function MonthView({ monthId, year, themeColor, events, categories, onDayClick, today }) {
  const insets = useSafeAreaInsets();
  const days = useMemo(() => greekMonthDays(monthId, year), [monthId, year]);

  if (monthId === 'PLANNING') {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 24, paddingBottom: 24 + insets.bottom + 48 }}
      >
        {days.map(d => (
          <PlanningCell
            key={d}
            isoDate={d}
            events={eventsForDate(events, d)}
            categories={categories}
            isToday={d === today}
            themeColor={themeColor}
            onClick={() => onDayClick(d)}
          />
        ))}
      </ScrollView>
    );
  }

  // Build the grid with ghost days from prev/next month
  const startDow = dayOfWeek(days[0]);
  const dowToCol = (dow) => (dow + 6) % 7;
  const leadingCount = dowToCol(startDow);
  const trailingCount = (7 - ((days.length + leadingCount) % 7)) % 7;

  const prevMonth = prevGreekMonth(monthId, year);
  const prevDays = greekMonthDays(prevMonth.monthId, prevMonth.year);
  const leadingGhosts = prevDays.slice(-leadingCount);

  const nextMonth = nextGreekMonth(monthId, year);
  const nextDays = greekMonthDays(nextMonth.monthId, nextMonth.year);
  const trailingGhosts = nextDays.slice(0, trailingCount);

  const cells = [
    ...leadingGhosts.map(iso => ({ iso, ghost: true })),
    ...days.map(iso => ({ iso, ghost: false })),
    ...trailingGhosts.map(iso => ({ iso, ghost: true })),
  ];

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[
        styles.container,
        { paddingBottom: insets.bottom + 56 },
      ]}
    >
      <DayHeader />
      <View style={styles.grid}>
        {cells.map(({ iso, ghost }, i) => (
          <DayCell
            key={`${iso}-${ghost ? 'g' : 'r'}-${i}`}
            isoDate={iso}
            ghost={ghost}
            events={ghost ? [] : eventsForDate(events, iso)}
            categories={categories}
            isToday={!ghost && iso === today}
            themeColor={themeColor}
            year={year}
            onClick={() => !ghost && onDayClick(iso)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function DayHeader() {
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  return (
    <View style={styles.dayHeader}>
      {days.map(d => (
        <Text key={d} style={styles.dayHeaderText}>
          {d.toUpperCase()}
        </Text>
      ))}
    </View>
  );
}

function DayCell({ isoDate, ghost, events, categories, isToday, themeColor, year, onClick }) {
  const greek = gregToGreek(isoDate);
  const holidays = ghost ? [] : ASATRU_HOLIDAYS.filter(
    h => h.greekMonth === greek?.monthId && h.greekDay === greek?.day
  );
  const reminders = ghost ? [] : remindersForDate(isoDate, year);
  const hasHoliday = holidays.length > 0;
  const hasReminder = reminders.length > 0 && !hasHoliday;
  const gregDay = new Date(isoDate + 'T12:00:00').getDate();

  const primaryHoliday = hasHoliday
    ? (holidays.find(h => h.type !== 'remembrance') || holidays[0])
    : null;
  const isRemembrance = primaryHoliday?.type === 'remembrance';

  const eventDots = events.slice(0, 4).map(e => {
    const cat = categoryById(categories, e.categoryId);
    return cat?.color || COLORS.textMuted;
  });

  const cellStyle = [
    styles.cell,
    {
      width: CELL_SIZE,
      height: CELL_SIZE * 1.15,
      backgroundColor: ghost
        ? 'transparent'
        : isToday
          ? `${themeColor}20`
          : COLORS.bgSurface,
      borderColor: ghost
        ? 'transparent'
        : isToday
          ? themeColor
          : COLORS.borderSubtle,
    },
  ];

  return (
    <TouchableOpacity
      onPress={onClick}
      activeOpacity={ghost ? 1 : 0.7}
      style={cellStyle}
    >
      {hasReminder && (
        <View style={[styles.reminderDot, { backgroundColor: COLORS.textMuted }]} />
      )}

      <View style={styles.dayNumberRow}>
        <Text style={[
          styles.dayNumber,
          {
            fontSize: ghost ? 14 : 17,
            color: ghost
              ? COLORS.textFaint
              : isToday
                ? themeColor
                : COLORS.textPrimary,
            opacity: ghost ? 0.5 : 1,
          },
        ]}>
          {ghost ? gregDay : greek?.day}
        </Text>
        {!ghost && (
          <Text style={styles.gregDayMini}>{gregDay}</Text>
        )}
      </View>

      {primaryHoliday && !ghost && (
        <Text style={[
          styles.holidaySymbol,
          {
            color: isRemembrance ? COLORS.textSecondary : themeColor,
            opacity: isRemembrance ? 0.7 : 0.9,
            fontFamily: isRemembrance ? FONTS.mono : undefined,
          },
        ]}>
          {primaryHoliday.symbol}
          {holidays.length > 1 && (
            <Text style={styles.holidayMore}> +{holidays.length - 1}</Text>
          )}
        </Text>
      )}

      {eventDots.length > 0 && (
        <View style={styles.eventDotsRow}>
          {eventDots.map((color, i) => (
            <View key={i} style={[styles.eventDot, { backgroundColor: color }]} />
          ))}
          {events.length > 4 && (
            <Text style={styles.eventMore}>+{events.length - 4}</Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

function PlanningCell({ isoDate, events, isToday, themeColor, onClick }) {
  return (
    <TouchableOpacity
      onPress={onClick}
      activeOpacity={0.7}
      style={[styles.planningCell, { borderColor: themeColor }]}
    >
      <Text style={[styles.planningSymbol, { color: themeColor }]}>✦</Text>
      <Text style={styles.planningTitle}>Planning Day</Text>
      {events.length > 0 && (
        <Text style={styles.planningEvents}>
          {events.length} event{events.length === 1 ? '' : 's'}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: 12,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  dayHeaderText: {
    width: CELL_SIZE,
    textAlign: 'center',
    fontSize: 9,
    fontFamily: FONTS.mono,
    letterSpacing: 2,
    color: COLORS.textFaint,
    paddingVertical: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CELL_GAP,
  },
  cell: {
    borderWidth: 1,
    borderRadius: 3,
    padding: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  reminderDot: {
    position: 'absolute',
    top: 3, right: 3,
    width: 4, height: 4,
    borderRadius: 2,
    opacity: 0.5,
  },
  dayNumberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  dayNumber: {
    fontFamily: FONTS.display,
    fontWeight: '500',
  },
  gregDayMini: {
    fontSize: 8,
    fontFamily: FONTS.mono,
    color: COLORS.textFaint,
  },
  holidaySymbol: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
  },
  holidayMore: {
    fontSize: 7,
    color: COLORS.textFaint,
  },
  eventDotsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    marginTop: 'auto',
    justifyContent: 'center',
    paddingBottom: 2,
  },
  eventDot: {
    width: 5, height: 5,
    borderRadius: 2.5,
  },
  eventMore: {
    fontSize: 7,
    fontFamily: FONTS.mono,
    color: COLORS.textMuted,
  },
  planningCell: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  planningSymbol: {
    fontSize: 36,
    fontFamily: FONTS.display,
  },
  planningTitle: {
    fontSize: 20,
    fontFamily: FONTS.display,
    color: COLORS.textPrimary,
    marginTop: 8,
  },
  planningEvents: {
    fontSize: 12,
    fontFamily: FONTS.body,
    fontStyle: 'italic',
    color: COLORS.textSecondary,
    marginTop: 6,
  },
});
