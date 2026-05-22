import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, FONTS } from '../lib/theme';
import { fmtGreg } from '../lib/constants';
import { ASATRU_HOLIDAYS } from '../lib/holidays';

export default function SeasonalBanner({ meta, year, onPrev, onNext, onToday }) {
  const { name, letter, theme, range } = meta;
  const holidayCount = ASATRU_HOLIDAYS.filter(h => {
    const matchMap = {
      'Alpha':'M01','Beta':'M02','Gamma':'M03','Delta':'M04','Epsilon':'M05',
      'Zeta':'M06','Eta':'M07','Theta':'M08','Iota':'M09','Kappa':'M10',
      'Lambda':'M11','Mu':'M12','Nu':'M13','Planning Day':'PLANNING',
    };
    return h.greekMonth === matchMap[name];
  }).length;

  return (
    <View style={[styles.container, { backgroundColor: `${theme.color}1a` }]}>
      <View style={styles.navRow}>
        <TouchableOpacity onPress={onPrev} style={styles.navBtn}>
          <Text style={styles.navBtnText}>‹</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onToday} style={styles.todayBtn}>
          <Text style={styles.todayBtnText}>TODAY</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onNext} style={styles.navBtn}>
          <Text style={styles.navBtnText}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.titleArea}>
        <Text style={[styles.themeLabel, { color: theme.color }]}>
          {theme.theme.toUpperCase()}
        </Text>

        <View style={styles.nameRow}>
          <Text style={[styles.letter, { color: theme.color }]}>{letter}</Text>
          <Text style={styles.name}>{name}</Text>
        </View>

        <Text style={styles.meaning}>{theme.meaning}</Text>

        <Text style={styles.dateRange}>
          {fmtGreg(range.start)} – {fmtGreg(range.end)} · {year}
          {holidayCount > 0 && (
            <Text style={{ color: theme.color }}>  · {holidayCount} marked</Text>
          )}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  navBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  navBtnText: {
    fontSize: 28,
    fontFamily: FONTS.display,
    color: COLORS.textSecondary,
  },
  todayBtn: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: COLORS.borderMid,
  },
  todayBtnText: {
    fontSize: 10,
    fontFamily: FONTS.mono,
    color: COLORS.textMuted,
    letterSpacing: 2,
  },
  titleArea: { alignItems: 'center' },
  themeLabel: {
    fontSize: 12,
    fontFamily: FONTS.display,
    letterSpacing: 3,
    marginBottom: 4,
    opacity: 0.9,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  letter: {
    fontSize: 38,
    fontFamily: FONTS.display,
    fontWeight: '600',
    marginRight: 10,
  },
  name: {
    fontSize: 38,
    fontFamily: FONTS.display,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  meaning: {
    fontSize: 12,
    fontFamily: FONTS.body,
    fontStyle: 'italic',
    color: COLORS.textMuted,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  dateRange: {
    fontSize: 10,
    fontFamily: FONTS.mono,
    color: COLORS.textFaint,
    marginTop: 6,
    letterSpacing: 1,
  },
});
