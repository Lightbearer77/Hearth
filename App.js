import { useState, useEffect, useMemo, useRef, useCallback, Component } from 'react';
import { View, Text, StatusBar, StyleSheet, PanResponder, ScrollView, TouchableOpacity, Alert, AppState } from 'react-native';
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
  getAllTasks, saveTask as dbSaveTask, deleteTask as dbDeleteTask,
} from './lib/storage';
import { newTask, toggleDone, toggleCarry } from './lib/tasks';
import { loadCachedPicks, fetchForgePicks } from './lib/forgeSync';

import SeasonalBanner from './components/SeasonalBanner';
import MonthView from './components/MonthView';
import AgendaView from './components/AgendaView';
import DayView from './components/DayView';
import SearchOverlay from './components/SearchOverlay';
import DayDetail from './components/DayDetail';
import EventModal from './components/EventModal';
import SettingsModal from './components/SettingsModal';
import { getPermissionStatus, refreshAllNotifications } from './lib/notifications';
import { durationDays, addDaysISO, splitSeriesAt } from './lib/recurrence';

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
  const [daySel, setDaySel] = useState(todayISO());
  const [searchOpen, setSearchOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [ready, setReady] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  // When editing one occurrence of a series: { mode:'occurrence', masterId, occurrenceIso }
  const [editingCtx, setEditingCtx] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [tasks, setTasks] = useState([]);
  // Read-only mirror of the Forge's In Progress lane (see lib/forgeSync.js).
  const [forge, setForge] = useState({
    picks: [], pushedAt: 0, fetchedAt: 0, loading: false, error: false,
  });
  const lastForgeAttempt = useRef(0);

  // Throttled to once per 30s unless forced (the day sheet's REFRESH button).
  // A failure keeps whatever picks are already on screen.
  const refreshForge = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastForgeAttempt.current < 30000) return;
    lastForgeAttempt.current = now;
    setForge(f => ({ ...f, loading: true }));
    try {
      const res = await fetchForgePicks();
      setForge({ ...res, loading: false, error: false });
    } catch (e) {
      console.log('[Hearth] Forge picks refresh failed:', e?.message);
      setForge(f => ({ ...f, loading: false, error: true }));
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
        const [evts, cats, tks] = await Promise.all([
          getAllEvents(), getAllCategories(),
          getAllTasks().catch(e => { console.warn('Tasks load failed', e); return []; }),
        ]);
        setEvents(evts);
        setCategories(cats);
        setTasks(tks);
      } catch (e) {
        console.warn('Init failed', e);
      } finally {
        setReady(true);
      }

      // Forge picks: show the cached list immediately, then refresh in the
      // background. Neither can block or crash startup.
      try {
        const cached = await loadCachedPicks();
        setForge(f => ({ ...f, ...cached }));
      } catch { /* cache is best-effort */ }
      refreshForge(true);

      // Rolling 90-day notification window: re-schedule on every launch so
      // reminders keep firing even if Settings is never opened again. Runs
      // after setReady — cannot block or crash startup.
      try {
        const status = await getPermissionStatus();
        if (status === 'granted') {
          const res = await refreshAllNotifications();
          console.log(`[Hearth] Notification window refreshed: ${res.scheduled} scheduled`);
        }
      } catch (notifErr) {
        console.log('[Hearth] Notification refresh skipped:', notifErr?.message);
      }
    })();
  }, []);

  // Coming back to Hearth after a Forge push: pick up the new In Progress set.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refreshForge(false);
    });
    return () => sub.remove();
  }, [refreshForge]);

  const handleAddTask = useCallback(async (title, carryOver) => {
    if (!selectedDate) return;
    try {
      const task = newTask({ title, date: selectedDate, carryOver });
      await dbSaveTask(task);
      setTasks(prev => [...prev, task]);
    } catch (e) { console.warn('Task add failed', e); }
  }, [selectedDate]);

  const replaceTask = useCallback(async (next) => {
    try {
      const stamped = { ...next, updatedAt: Date.now() };
      await dbSaveTask(stamped);
      setTasks(prev => prev.map(t => (t.id === stamped.id ? stamped : t)));
    } catch (e) { console.warn('Task update failed', e); }
  }, []);

  const handleToggleTask = useCallback(
    (task, viewedIso) => replaceTask(toggleDone(task, viewedIso, todayISO())),
    [replaceTask]
  );
  const handleToggleCarry = useCallback(
    (task) => replaceTask(toggleCarry(task)),
    [replaceTask]
  );

  const handleDeleteTask = useCallback(async (task) => {
    try {
      await dbDeleteTask(task.id);
      setTasks(prev => prev.filter(t => t.id !== task.id));
    } catch (e) { console.warn('Task delete failed', e); }
  }, []);

  const goPrev = () => setView(v => prevGreekMonth(v.monthId, v.year));
  const goNext = () => setView(v => nextGreekMonth(v.monthId, v.year));
  const goToday = () => {
    const t = gregToGreek(todayISO());
    if (t) setView({ monthId: t.monthId, year: t.year });
  };

  const openEventForEdit = useCallback((evt, occurrenceIso) => {
    const repeating = (evt.recurrence || 'none') !== 'none';
    if (!repeating || !occurrenceIso) {
      setEditingCtx(null);
      setEditingEvent(evt);
      return;
    }
    Alert.alert('Repeating event', 'Apply changes to\u2026', [
      {
        text: 'This occurrence',
        onPress: () => {
          // Detach: a standalone draft for this date; on save the series
          // gains an exception for the original slot.
          const dur = durationDays(evt);
          const draft = {
            ...evt,
            id: newEvent().id,
            date: occurrenceIso,
            endDate: dur > 0 ? addDaysISO(occurrenceIso, dur) : '',
            recurrence: 'none',
            recurrenceInterval: 1,
            exdates: [],
            createdAt: Date.now(),
          };
          setEditingCtx({ mode: 'occurrence', masterId: evt.id, occurrenceIso });
          setEditingEvent(draft);
        },
      },
      {
        text: 'This & future',
        onPress: () => {
          const { newMaster } = splitSeriesAt(evt, occurrenceIso, newEvent().id);
          setEditingCtx({ mode: 'future', masterId: evt.id, occurrenceIso });
          setEditingEvent(newMaster);
        },
      },
      {
        text: 'Entire series',
        onPress: () => { setEditingCtx(null); setEditingEvent(evt); },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, []);

  const exdateMaster = useCallback(async (masterId, iso) => {
    const master = events.find(e => e.id === masterId);
    if (!master) return;
    const exdates = Array.isArray(master.exdates) ? master.exdates : [];
    if (!exdates.includes(iso)) {
      await dbSaveEvent({ ...master, exdates: [...exdates, iso] });
    }
  }, [events]);

  const bumpNotifications = useCallback(() => {
    (async () => {
      try {
        const status = await getPermissionStatus();
        if (status === 'granted') await refreshAllNotifications();
      } catch (e) {
        console.log('[Hearth] Notification bump skipped:', e?.message);
      }
    })();
  }, []);

  const handleSaveEvent = useCallback(async (evt) => {
    try {
      await dbSaveEvent(evt);
      if (editingCtx?.mode === 'future' && editingCtx.masterId) {
        // New master already saved above; end the old series the day before.
        const master = events.find(e => e.id === editingCtx.masterId);
        if (master) {
          const { truncatedMaster } = splitSeriesAt(master, editingCtx.occurrenceIso, master.id);
          if (truncatedMaster) await dbSaveEvent(truncatedMaster);
          else await dbDeleteEvent(master.id);
        }
        setEvents(await getAllEvents());
      } else if (editingCtx?.mode === 'occurrence' && editingCtx.masterId) {
        await exdateMaster(editingCtx.masterId, editingCtx.occurrenceIso);
        setEvents(await getAllEvents());
      } else {
        setEvents(prev => {
          const idx = prev.findIndex(e => e.id === evt.id);
          return idx >= 0 ? prev.map((e, i) => i === idx ? evt : e) : [...prev, evt];
        });
      }
      setEditingEvent(null);
      setEditingCtx(null);
      bumpNotifications();
    } catch (e) { console.warn('Save failed', e); }
  }, [bumpNotifications, editingCtx, exdateMaster]);

  const handleDeleteEvent = useCallback(async (id) => {
    try {
      if (editingCtx?.mode === 'future' && editingCtx.masterId) {
        // Draft was never persisted — deleting "this and future" just ends
        // the old series the day before the pivot (or removes it entirely
        // when the pivot is the first occurrence).
        const master = events.find(e => e.id === editingCtx.masterId);
        if (master) {
          const { truncatedMaster } = splitSeriesAt(master, editingCtx.occurrenceIso, master.id);
          if (truncatedMaster) await dbSaveEvent(truncatedMaster);
          else await dbDeleteEvent(master.id);
        }
        setEvents(await getAllEvents());
      } else if (editingCtx?.mode === 'occurrence' && editingCtx.masterId) {
        // Draft was never persisted — removing the occurrence just adds an
        // exception date to the series.
        await exdateMaster(editingCtx.masterId, editingCtx.occurrenceIso);
        setEvents(await getAllEvents());
      } else {
        await dbDeleteEvent(id);
        setEvents(prev => prev.filter(e => e.id !== id));
      }
      setEditingEvent(null);
      setEditingCtx(null);
      bumpNotifications();
    } catch (e) { console.warn('Delete failed', e); }
  }, [bumpNotifications, editingCtx, exdateMaster]);

  const startNewEvent = (isoDate, startTime) => {
    setSelectedDate(null);
    setEditingCtx(null);
    setEditingEvent(newEvent({ date: isoDate, ...(startTime ? { startTime } : {}) }));
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
        onSearch={() => setSearchOpen(true)}
        onPrev={goPrev} onNext={goNext} onToday={goToday}
        onOpenSettings={() => setShowSettings(true)}
      />
      {viewMode === 'month' ? (
        <MonthView
          monthId={view.monthId} year={view.year}
          themeColor={monthMeta.theme.color} events={events}
          categories={categories} onDayClick={setSelectedDate} today={todayISO()}
        />
      ) : viewMode === 'agenda' ? (
        <AgendaView
          monthId={view.monthId} year={view.year}
          themeColor={monthMeta.theme.color} events={events}
          categories={categories} onDayClick={setSelectedDate}
          onEventClick={openEventForEdit} today={todayISO()}
        />
      ) : (
        <DayView
          isoDate={daySel} events={events} categories={categories}
          themeColor={monthMeta.theme.color}
          onPrev={() => setDaySel(d => addDaysISO(d, -1))}
          onNext={() => setDaySel(d => addDaysISO(d, 1))}
          onToday={() => setDaySel(todayISO())}
          onEdit={openEventForEdit}
          onAddAt={(iso, t) => startNewEvent(iso, t)}
        />
      )}
      {searchOpen && (
        <SearchOverlay
          events={events} categories={categories}
          onClose={() => setSearchOpen(false)}
          onPick={(evt) => {
            setSearchOpen(false);
            const gg = gregToGreek(evt.date);
            if (gg && !gg.isPlanningDay) setView({ monthId: gg.monthId, year: gg.year });
            setDaySel(evt.date);
            setViewMode('day');
          }}
        />
      )}

      {selectedDate && (
        <DayDetail
          isoDate={selectedDate} events={events} categories={categories}
          onClose={() => setSelectedDate(null)}
          onAdd={() => startNewEvent(selectedDate)}
          onEdit={(evt, iso) => { setSelectedDate(null); openEventForEdit(evt, iso); }}
          tasks={tasks} todayIso={todayISO()} forge={forge}
          onAddTask={handleAddTask}
          onToggleTask={handleToggleTask}
          onToggleCarry={handleToggleCarry}
          onDeleteTask={handleDeleteTask}
          onRefreshForge={() => refreshForge(true)}
        />
      )}
      {editingEvent && (
        <EventModal
          event={editingEvent} categories={categories}
          occurrenceMode={editingCtx?.mode === 'occurrence'}
          futureMode={editingCtx?.mode === 'future'}
          onSave={handleSaveEvent} onDelete={handleDeleteEvent}
          onClose={() => { setEditingEvent(null); setEditingCtx(null); }}
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
