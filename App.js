import { useState, useEffect, useMemo, useRef } from 'react';
import { View, StatusBar, StyleSheet, PanResponder } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { COLORS } from './lib/theme';
import {
  gregToGreek, greekMonthRange, nextGreekMonth, prevGreekMonth,
  SEASONAL_THEMES, GREEK_MONTHS, todayISO,
} from './lib/constants';
import { initDatabase, getAllEvents, getAllCategories } from './lib/storage';

import SeasonalBanner from './components/SeasonalBanner';
import MonthView from './components/MonthView';

export default function App() {
  const [view, setView] = useState(() => {
    const t = gregToGreek(todayISO()) || { monthId: 'M01', year: new Date().getFullYear() };
    return { monthId: t.monthId, year: t.year };
  });
  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [ready, setReady] = useState(false);

  // ─── Init database, load data ───
  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
        const [evts, cats] = await Promise.all([getAllEvents(), getAllCategories()]);
        setEvents(evts);
        setCategories(cats);
      } catch (e) {
        console.warn('DB init failed', e);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // ─── Navigation ───
  const goPrev  = () => setView(v => prevGreekMonth(v.monthId, v.year));
  const goNext  = () => setView(v => nextGreekMonth(v.monthId, v.year));
  const goToday = () => {
    const t = gregToGreek(todayISO());
    if (t) setView({ monthId: t.monthId, year: t.year });
  };

  // ─── Swipe handling ───
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 20 && Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderRelease: (_, gs) => {
        if (Math.abs(gs.dx) < 50) return;
        if (gs.dx < 0) goNext();
        else goPrev();
      },
    })
  ).current;

  const monthMeta = useMemo(() => {
    if (view.monthId === 'PLANNING') {
      return {
        name: 'Planning Day',
        letter: '✦',
        theme: SEASONAL_THEMES.PLANNING,
        range: greekMonthRange('PLANNING', view.year),
      };
    }
    const m = GREEK_MONTHS.find(gm => gm.id === view.monthId);
    return {
      name: m.name,
      letter: m.letter,
      theme: SEASONAL_THEMES[m.id],
      range: greekMonthRange(view.monthId, view.year),
    };
  }, [view]);

  if (!ready) {
    return <View style={styles.container} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container} {...panResponder.panHandlers}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bgDeep} />
        <SeasonalBanner
          meta={monthMeta}
          year={view.year}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goToday}
        />
        <MonthView
          monthId={view.monthId}
          year={view.year}
          themeColor={monthMeta.theme.color}
          events={events}
          categories={categories}
          onDayClick={(iso) => console.log('Day clicked:', iso)}
          today={todayISO()}
        />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgDeep,
    paddingTop: 40, // status bar offset
  },
});
