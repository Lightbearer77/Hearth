import { useMemo, useRef, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { COLORS, FONTS } from '../lib/theme';
import { gregToGreek, fmtGregLong, todayISO } from '../lib/constants';
import { eventsByDateInRange, durationDays } from '../lib/recurrence';
import { layoutDayEvents } from '../lib/dayLayout';

const HOUR_H = 52;
const GUTTER = 46;

const toMin = (t) => {
  if (!t || !/^\d{2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const pad = (n) => String(n).padStart(2, '0');

export default function DayView({
  isoDate, events, categories, themeColor,
  onPrev, onNext, onToday, onEdit, onAddAt,
}) {
  const scrollRef = useRef(null);
  const today = todayISO();
  const isToday = isoDate === today;
  const g = gregToGreek(isoDate);

  const catColor = (id) =>
    categories.find(c => c.id === id)?.color || COLORS.accent;

  const { blocks, strip } = useMemo(() => {
    const wrappers = eventsByDateInRange(events, [isoDate])[isoDate] || [];
    const timed = [];
    const stripItems = [];
    for (const w of wrappers) {
      const evt = w.event;
      const startMin = toMin(evt.startTime);
      if (!evt.allDay && startMin !== null && durationDays(evt) === 0) {
        const endRaw = toMin(evt.endTime);
        const endMin = endRaw !== null && endRaw > startMin ? endRaw : startMin + 60;
        timed.push({ id: evt.id, startMin, endMin, evt });
      } else {
        stripItems.push(w);
      }
    }
    return { blocks: layoutDayEvents(timed), strip: stripItems };
  }, [events, isoDate]);

  // Land the viewport usefully: near now when today, near 07:00 otherwise.
  useEffect(() => {
    const now = new Date();
    const target = isToday
      ? Math.max(0, (now.getHours() - 1.5) * HOUR_H)
      : 7 * HOUR_H;
    const t = setTimeout(() => scrollRef.current?.scrollTo({ y: target, animated: false }), 0);
    return () => clearTimeout(t);
  }, [isoDate, isToday]);

  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.navRow}>
        <TouchableOpacity onPress={onPrev} style={styles.navBtn}>
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.navTitle, { color: themeColor }]}>
            {g?.isPlanningDay ? 'Planning Day' : g ? `${g.monthName} ${g.day}` : isoDate}
          </Text>
          <Text style={styles.navSub}>{fmtGregLong(isoDate)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {!isToday && (
            <TouchableOpacity onPress={onToday} style={styles.todayBtn}>
              <Text style={[styles.todayBtnText, { color: themeColor }]}>TODAY</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onNext} style={styles.navBtn}>
            <Text style={styles.navArrow}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      {strip.length > 0 && (
        <View style={styles.strip}>
          {strip.map(({ event }) => (
            <TouchableOpacity
              key={event.id}
              onPress={() => onEdit(event, isoDate)}
              style={[styles.stripChip, { backgroundColor: `${catColor(event.categoryId)}2a`, borderColor: catColor(event.categoryId) }]}
            >
              <Text style={[styles.stripChipText, { color: catColor(event.categoryId) }]} numberOfLines={1}>
                {event.title || '(untitled)'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ScrollView ref={scrollRef} contentContainerStyle={{ height: 24 * HOUR_H + 12 }}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={(e) => {
            const hour = Math.min(23, Math.max(0, Math.floor(e.nativeEvent.locationY / HOUR_H)));
            onAddAt(isoDate, `${pad(hour)}:00`);
          }}
        />
        {Array.from({ length: 24 }, (_, h) => (
          <View key={h} pointerEvents="none" style={[styles.hourRow, { top: h * HOUR_H }]}>
            <Text style={styles.hourLabel}>{pad(h)}</Text>
            <View style={styles.hourLine} />
          </View>
        ))}

        <View pointerEvents="box-none" style={styles.lane}>
          {blocks.map(({ id, startMin, endMin, col, cols, evt }) => (
            <BlockView
              key={id}
              evt={evt} isoDate={isoDate}
              startMin={startMin} endMin={endMin} col={col} cols={cols}
              color={catColor(evt.categoryId)}
              onEdit={onEdit}
            />
          ))}
          {isToday && (
            <View pointerEvents="none" style={[styles.nowLine, { top: (nowMin / 60) * HOUR_H }]}>
              <View style={styles.nowDot} />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function BlockView({ evt, isoDate, startMin, endMin, col, cols, color, onEdit }) {
  const top = (startMin / 60) * HOUR_H;
  const height = Math.max(((endMin - startMin) / 60) * HOUR_H, 26);
  const widthPct = (100 / cols);
  return (
    <TouchableOpacity
      onPress={() => onEdit(evt, isoDate)}
      activeOpacity={0.7}
      style={[styles.block, {
        top,
        height,
        left: `${col * widthPct}%`,
        width: `${widthPct}%`,
        backgroundColor: `${color}26`,
        borderLeftColor: color,
      }]}
    >
      <Text style={[styles.blockTitle, { color }]} numberOfLines={1}>
        {evt.title || '(untitled)'}
      </Text>
      {height >= 40 && (
        <Text style={styles.blockTime}>
          {evt.startTime}{evt.endTime ? `–${evt.endTime}` : ''}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  navRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 8,
  },
  navBtn: { paddingHorizontal: 14, paddingVertical: 4 },
  navArrow: { fontSize: 22, color: COLORS.textSecondary },
  navTitle: { fontSize: 16, fontFamily: FONTS.display },
  navSub: { fontSize: 10, fontFamily: FONTS.mono, color: COLORS.textMuted, marginTop: 1 },
  todayBtn: {
    borderWidth: 1, borderColor: COLORS.borderMid, borderRadius: 4,
    paddingHorizontal: 8, paddingVertical: 4, marginRight: 2,
  },
  todayBtnText: { fontSize: 8, fontFamily: FONTS.mono, letterSpacing: 1.5 },
  strip: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    paddingHorizontal: 10, paddingBottom: 8,
  },
  stripChip: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
    maxWidth: '60%',
  },
  stripChipText: { fontSize: 10, fontFamily: FONTS.mono },
  hourRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-start' },
  hourLabel: {
    width: GUTTER - 8, textAlign: 'right',
    fontSize: 9, fontFamily: FONTS.mono, color: COLORS.textFaint,
    transform: [{ translateY: -5 }],
  },
  hourLine: { flex: 1, height: 1, backgroundColor: COLORS.borderSubtle, marginLeft: 6 },
  block: {
    position: 'absolute',
    borderLeftWidth: 3,
    borderRadius: 3,
    paddingHorizontal: 6, paddingVertical: 3,
    overflow: 'hidden',
  },
  blockTitle: { fontSize: 11, fontFamily: FONTS.body, fontWeight: '600' },
  blockTime: { fontSize: 9, fontFamily: FONTS.mono, color: COLORS.textMuted, marginTop: 1 },
  lane: {
    position: 'absolute', top: 0, bottom: 0, left: GUTTER, right: 4,
  },
  nowLine: {
    position: 'absolute', left: -4, right: 0,
    height: 2, backgroundColor: '#c05a4a',
  },
  nowDot: {
    position: 'absolute', left: -4, top: -3,
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#c05a4a',
  },
});
