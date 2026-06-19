import { useState, useEffect, useMemo, useRef, useCallback, Component } from 'react';
import { View, Text, StatusBar, StyleSheet, PanResponder, ScrollView, TouchableOpacity } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

class ErrorBoundary extends Component {
  state = { err: null, info: null };
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) {
    console.error('ErrorBoundary caught:', err, info);
    this.setState({ err, info });
  }
  render() {
    if (this.state.err) {
      return (
        <ScrollView style={{ flex: 1, backgroundColor: '#16120e', padding: 20, paddingTop: 60 }}>
          <Text style={{ color: '#c9a84c', fontSize: 18, fontFamily: 'serif', marginBottom: 12 }}>
            Caught a crash.
          </Text>
          <Text style={{ color: '#ede4d4', fontFamily: 'monospace', fontSize: 12, marginBottom: 16 }}>
            {String(this.state.err?.message || this.state.err)}
          </Text>
          <Text style={{ color: '#8a7a62', fontSize: 11, fontFamily: 'monospace', marginBottom: 16 }}>
            {String(this.state.err?.stack || '').slice(0, 2000)}
          </Text>
          {this.state.info?.componentStack && (
            <Text style={{ color: '#50463a', fontSize: 10, fontFamily: 'monospace' }}>
              {String(this.state.info.componentStack).slice(0, 1500)}
            </Text>
          )}
          <TouchableOpacity
            onPress={() => this.setState({ err: null, info: null })}
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

let COLORS, themeLoadErr = null;
try {
  COLORS = require('./lib/theme').COLORS;
} catch (e) {
  themeLoadErr = e;
  COLORS = { bgDeep: '#16120e', textPrimary: '#ede4d4', accent: '#c9a84c' };
}

let constants = {};
let constantsErr = null;
try {
  constants = require('./lib/constants');
} catch (e) {
  constantsErr = e;
}

let storage = {};
let storageErr = null;
try {
  storage = require('./lib/storage');
} catch (e) {
  storageErr = e;
}

let SeasonalBanner, MonthView, AgendaView, DayDetail, EventModal, SettingsModal;
let componentLoadErr = null;
try {
  SeasonalBanner = require('./components/SeasonalBanner').default;
  MonthView      = require('./components/MonthView').default;
  AgendaView     = require('./components/AgendaView').default;
  DayDetail      = require('./components/DayDetail').default;
  EventModal     = require('./components/EventModal').default;
  SettingsModal  = require('./components/SettingsModal').default;
} catch (e) {
  componentLoadErr = e;
}

function AppContent() {
  const insets = useSafeAreaInsets();

  const loadErr = themeLoadErr || constantsErr || storageErr || componentLoadErr;
  if (loadErr) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: COLORS.bgDeep, padding: 20, paddingTop: insets.top + 20 }}>
        <Text style={{ color: '#c9a84c', fontSize: 18, marginBottom: 12 }}>Module load error</Text>
        <Text style={{ color: '#ede4d4', fontFamily: 'monospace', fontSize: 12, marginBottom: 16 }}>
          {String(loadErr.message || loadErr)}
        </Text>
        <Text style={{ color: '#8a7a62', fontSize: 10, fontFamily: 'monospace' }}>
          {String(loadErr.stack || '').slice(0, 2000)}
        </Text>
      </ScrollView>
    );
  }

  const { gregToGreek, greekMonthRange, nextGreekMonth, prevGreekMonth,
          SEASONAL_THEMES, GREEK_MONTHS, todayISO } = constants;
  const { initDatabase, getAllEvents, getAllCategories,
          saveEvent: dbSaveEvent, deleteEvent: dbDeleteEvent, newEvent } = storage;

  const [view, setView] = useState(() => {
    try {
      const t = gregToGreek(todayISO()) || { monthId: 'M01', year: new Date().getFullYear() };
      return { monthId: t.monthId, year: t.year };
    } catch {
      return { monthId: 'M01', year: new Date().getFullYear() };
    }
  });
  const [viewMode, setViewMode] = useState('month');
  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState(null);
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
        setInitError(e);
      } finally {
        setReady(true);
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
    } catch (e) { console.warn('Save event failed', e); }
  }, []);

  const handleDeleteEvent = useCallback(async (id) => {
    try {
      await dbDeleteEvent(id);
      setEvents(prev => prev.filter(e => e.id !== id));
      setEditingEvent(null);
    } catch (e) { console.warn('Delete event failed', e); }
  }, []);

  const startNewEvent = (isoDate) => {
    setSelectedDate(null);
    setEditingEvent(newEvent({ date: isoDate }));
  };

  const refreshCategories = useCallback(async () => {
    const cats = await getAllCategories();
    setCategories(cats);
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

  if (initError) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: COLORS.bgDeep, padding: 20, paddingTop: insets.top + 20 }}>
        <Text style={{ color: '#c9a84c', fontSize: 18, marginBottom: 12 }}>Init error</Text>
        <Text style={{ color: '#ede4d4', fontFamily: 'monospace', fontSize: 12 }}>
          {String(initError.message || initError)}
        </Text>
        <Text style={{ color: '#8a7a62', fontSize: 10, fontFamily: 'monospace', marginTop: 16 }}>
          {String(initError.stack || '').slice(0, 2000)}
        </Text>
      </ScrollView>
    );
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
        <MonthView monthId={view.monthId} year={view.year}
          themeColor={monthMeta.theme.color} events={events}
          categories={categories} onDayClick={setSelectedDate} today={todayISO()} />
      ) : (
        <AgendaView monthId={view.monthId} year={view.year}
          themeColor={monthMeta.theme.color} events={events}
          categories={categories} onDayClick={setSelectedDate}
          onEventClick={setEditingEvent} today={todayISO()} />
      )}
      {selectedDate && (
        <DayDetail isoDate={selectedDate} events={events} categories={categories}
          onClose={() => setSelectedDate(null)}
          onAdd={() => startNewEvent(selectedDate)}
          onEdit={(evt) => { setSelectedDate(null); setEditingEvent(evt); }} />
      )}
      {editingEvent && (
        <EventModal event={editingEvent} categories={categories}
          onSave={handleSaveEvent} onDelete={handleDeleteEvent}
          onClose={() => setEditingEvent(null)} />
      )}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)}
          onCategoriesChanged={refreshCategories} />
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
