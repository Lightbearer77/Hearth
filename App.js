import { useState, useEffect, useMemo, useRef, useCallback, Component } from 'react';
import { View, Text, StatusBar, StyleSheet, PanResponder, ScrollView, TouchableOpacity } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from './lib/theme';
import {
  gregToGreek, greekMonthRange, nextGreekMonth, prevGreekMonth,
  SEASONAL_THEMES, GREEK_MONTHS, todayISO,
} from './lib/constants';
import {
  initDatabase, getAllEvents, getAllCategories,
  saveEvent as dbSaveEvent, deleteEvent as dbDeleteEvent,
  newEvent,
} from './lib/storage';

import SeasonalBanner from './components/SeasonalBanner';
import MonthView from './components/MonthView';
import AgendaView from './components/AgendaView';
import DayDetail from './components/DayDetail';
import EventModal from './components/EventModal';
import SettingsModal from './components/SettingsModal';
import { getPermissionStatus, scheduleAllHolidayNotifications } from './lib/notifications';

// ─── ErrorBoundary catches render-phase crashes and shows the error ───
class ErrorBoundary extends Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error('Render crash:', err, info); }
  render() {
    if (this.state.err) {
      return (
        <ScrollView style={{ flex: 1, backgroundColor: '#16120e', padding: 20, paddingTop: 60 }}>
          <Text style={{ color: '#c9a84c', fontSize: 18, marginBottom: 12 }}>
            Render error
          </Text>
          <Text style={{ color: '#ede4d4', fontFamily: 'monospace', fontSize: 12, marginBottom: 16 }}>
            {String(this.state.err?.message || this.state.err)}
          </Text>
          <Text style={{ color: '#8a7a62', fontSize: 11, fontFamily: 'monospace' }}>
            {String(this.state.err?.stack || '').slice(0, 2000)}
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ err: null })}
            style={{ marginTop: 24, padding: 12, borderWidth: 1, borderColor: '#3e3628', borderRadius: 4, alignItems: 'center' }}
          >
            <Text style={{ color: '#c4b49a', fontFamily: 'monospace', fontSize: 11, letterSpacing: 2 }}>
              RETRY
            </Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const insets = useSafeAreaInsets();

  const [view, setView] = useState(() => {
    const t = gregToGreek(todayISO()) || { monthId: 'M01', year: new Date().getFullYear() };
    return { monthId: t.monthId, year: t.year };
  });
  const [viewMode, setViewMode] = useState('month');
  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [ready, setReady] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
        const [evts, cats] = await Promise.all([getAllEvents(), getAllCategories()]);
        setEvents(evts);
        setCategories(cats);
      } catch (e) {
        console.warn('Init failed', e);
      } finally {
        setReady(true);
      }

      // Rolling 90-day notification window: re-schedule on every launch so
      // reminders keep firing even if Settings is never opened again. Runs
      // after setReady — cannot block or crash startup.
      try {
        const status = await getPermissionStatus();
        if (status === 'granted') {
          const res = await scheduleAllHolidayNotifications();
          console.log(`[Hearth] Notification window refreshed: ${res.scheduled} scheduled`);
        }
      } catch (notifErr) {
        console.log('[Hearth] Notification refresh skipped:', notifErr?.message);
      }
    })();
  }, []);

  const goPrev = () => setView(v => prevGreekMonth(v.monthId, v.year));
  const goNext = () => setView(v => nextGreekMonth(v.monthId, v.year));
  const goToday = () => {
    const t = gregToGreek(todayISO());
    if (t) setView({ monthId: t.monthId, year: t.year });
  };

  const handleSaveEvent = useCallback(async (evt) => {
    try {
      await dbSaveEvent(evt);
      setEvents(prev => {
        const idx = prev.findIndex(e => e.id === evt.id);
        return idx >= 0 ? prev.map((e, i) => i === idx ? evt : e) : [...prev, evt];
      });
      setEditingEvent(null);
    } catch (e) { console.warn('Save failed', e); }
  }, []);

  const handleDeleteEvent = useCallback(async (id) => {
    try {
      await dbDeleteEvent(id);
      setEvents(prev => prev.filter(e => e.id !== id));
      setEditingEvent(null);
    } catch (e) { console.warn('Delete failed', e); }
  }, []);

  const startNewEvent = (isoDate) => {
    setSelectedDate(null);
    setEditingEvent(newEvent({ date: isoDate }));
  };

  const refreshCategories = useCallback(async () => {
    // Category edits can also rewrite events (deletion reassigns their
    // categoryId in SQLite), so reload both to keep dots/colors accurate.
    const [cats, evts] = await Promise.all([getAllCategories(), getAllEvents()]);
    setCategories(cats);
    setEvents(evts);
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 20 && Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderRelease: (_, gs) => {
        if (Math.abs(gs.dx) < 50) return;
        if (gs.dx < 0) goNext(); else goPrev();
      },
    })
  ).current;

  const monthMeta = useMemo(() => {
    if (view.monthId === 'PLANNING') {
      return {
        name: 'Planning Day', letter: '✦',
        theme: SEASONAL_THEMES.PLANNING,
        range: greekMonthRange('PLANNING', view.year),
      };
    }
    const m = GREEK_MONTHS.find(gm => gm.id === view.monthId);
    return {
      name: m.name, letter: m.letter,
      theme: SEASONAL_THEMES[m.id],
      range: greekMonthRange(view.monthId, view.year),
    };
  }, [view]);

  if (!ready) {
    return <View style={[styles.container, { paddingTop: insets.top }]} />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} {...panResponder.panHandlers}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bgDeep} />
      <SeasonalBanner
        meta={monthMeta} year={view.year}
        viewMode={viewMode} onSetViewMode={setViewMode}
        onPrev={goPrev} onNext={goNext} onToday={goToday}
        onOpenSettings={() => setShowSettings(true)}
      />
      {viewMode === 'month' ? (
        <MonthView
          monthId={view.monthId} year={view.year}
          themeColor={monthMeta.theme.color} events={events}
          categories={categories} onDayClick={setSelectedDate} today={todayISO()}
        />
      ) : (
        <AgendaView
          monthId={view.monthId} year={view.year}
          themeColor={monthMeta.theme.color} events={events}
          categories={categories} onDayClick={setSelectedDate}
          onEventClick={setEditingEvent} today={todayISO()}
        />
      )}
      {selectedDate && (
        <DayDetail
          isoDate={selectedDate} events={events} categories={categories}
          onClose={() => setSelectedDate(null)}
          onAdd={() => startNewEvent(selectedDate)}
          onEdit={(evt) => { setSelectedDate(null); setEditingEvent(evt); }}
        />
      )}
      {editingEvent && (
        <EventModal
          event={editingEvent} categories={categories}
          onSave={handleSaveEvent} onDelete={handleDeleteEvent}
          onClose={() => setEditingEvent(null)}
        />
      )}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onCategoriesChanged={refreshCategories}
        />
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <AppContent />
        </GestureHandlerRootView>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#16120e' },
});
