// ─── SQLite storage layer ───
// expo-sqlite gives us a real database. Much better than AsyncStorage
// for a daily-driver calendar that may end up with thousands of events.

import * as SQLite from 'expo-sqlite';
import { DEFAULT_CATEGORIES } from './theme';

let dbPromise = null;

const getDb = () => {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('hearth.db');
  }
  return dbPromise;
};

// ─── Schema versioning ───
// v0: original events/categories tables (implicit, pre-versioning installs)
// v1: events.updated_at column (change tracking; future sync layer seed)
// v2: recurrence + reminders (per-event offset array, minutes before start).
//     Existing rows are backfilled to [0] so pre-v2 events keep their
//     at-start-time notification behavior.
// v3: recurrence_interval (custom "every N units") + exdates (per-occurrence
//     exceptions). Legacy 'biweekly' rows migrate to weekly × 2.
// v4: recurrence_until (series end date, inclusive, '' = open-ended).
// v5: sync. events.deleted (tombstone flag: deletes are soft so a deletion
//     can propagate through hearth-sync.json) + settings table (key/value,
//     device-local; holds the sync token). The ALTER is guarded by
//     PRAGMA table_info because ADD COLUMN is not idempotent.
const SCHEMA_VERSION = 5;

const MIGRATIONS = {
  1: async (db) => {
    await db.execAsync(
      "ALTER TABLE events ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0"
    );
  },
  2: async (db) => {
    await db.execAsync(
      "ALTER TABLE events ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none'"
    );
    await db.execAsync(
      "ALTER TABLE events ADD COLUMN reminders TEXT NOT NULL DEFAULT '[]'"
    );
    await db.runAsync("UPDATE events SET reminders = '[0]'");
  },
  3: async (db) => {
    await db.execAsync(
      "ALTER TABLE events ADD COLUMN recurrence_interval INTEGER NOT NULL DEFAULT 1"
    );
    await db.execAsync(
      "ALTER TABLE events ADD COLUMN exdates TEXT NOT NULL DEFAULT '[]'"
    );
    await db.runAsync(
      "UPDATE events SET recurrence = 'weekly', recurrence_interval = 2 WHERE recurrence = 'biweekly'"
    );
  },
  4: async (db) => {
    await db.execAsync(
      "ALTER TABLE events ADD COLUMN recurrence_until TEXT NOT NULL DEFAULT ''"
    );
  },
  5: async (db) => {
    const cols = await db.getAllAsync('PRAGMA table_info(events)');
    if (!cols.some(c => c.name === 'deleted')) {
      await db.execAsync(
        'ALTER TABLE events ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0'
      );
    }
    await db.execAsync(
      'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL DEFAULT \'\')'
    );
  },
};

const runMigrations = async (db) => {
  const row = await db.getFirstAsync('PRAGMA user_version');
  let current = row?.user_version ?? 0;
  while (current < SCHEMA_VERSION) {
    const next = current + 1;
    const migrate = MIGRATIONS[next];
    if (migrate) await migrate(db);
    await db.execAsync(`PRAGMA user_version = ${next}`);
    current = next;
  }
};

// ─── Initialize schema ───
export const initDatabase = async () => {
  const db = await getDb();

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      end_date TEXT NOT NULL DEFAULT '',
      start_time TEXT NOT NULL DEFAULT '',
      end_time TEXT NOT NULL DEFAULT '',
      all_day INTEGER NOT NULL DEFAULT 0,
      category_id TEXT NOT NULL DEFAULT 'G1',
      created_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_events_date     ON events(date);
    CREATE INDEX IF NOT EXISTS idx_events_end_date ON events(end_date);

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);

  await runMigrations(db);

  // Seed default categories if table is empty
  const row = await db.getFirstAsync('SELECT COUNT(*) AS n FROM categories');
  if (!row || row.n === 0) {
    for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
      const c = DEFAULT_CATEGORIES[i];
      await db.runAsync(
        'INSERT INTO categories (id, name, color, sort_order) VALUES (?, ?, ?, ?)',
        [c.id, c.name, c.color, i]
      );
    }
  }
};

// ─── Event helpers (DB row <-> JS object) ───
const rowToEvent = (row) => ({
  id:          row.id,
  title:       row.title,
  description: row.description,
  location:    row.location,
  date:        row.date,
  endDate:     row.end_date,
  startTime:   row.start_time,
  endTime:     row.end_time,
  allDay:      row.all_day === 1,
  categoryId:  row.category_id,
  createdAt:   row.created_at,
  updatedAt:   row.updated_at || 0,
  recurrence:  row.recurrence || 'none',
  recurrenceInterval: row.recurrence_interval || 1,
  recurrenceUntil: row.recurrence_until || '',
  reminders:   parseReminders(row.reminders),
  exdates:     parseJSONArray(row.exdates),
  deleted:     row.deleted === 1,
});

const parseJSONArray = (raw) => {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const parseReminders = (raw) => {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

export const newEvent = (overrides = {}) => ({
  id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  title: '',
  description: '',
  location: '',
  date: '',
  endDate: '',
  startTime: '',
  endTime: '',
  allDay: false,
  categoryId: 'G1',
  recurrence: 'none',
  recurrenceInterval: 1,
  recurrenceUntil: '',
  reminders: [0],
  exdates: [],
  createdAt: Date.now(),
  ...overrides,
});

// ─── Event CRUD ───
// Live events only — tombstones never reach the UI or the notification
// scheduler.
export const getAllEvents = async () => {
  const db = await getDb();
  const rows = await db.getAllAsync('SELECT * FROM events WHERE deleted = 0 ORDER BY date ASC');
  return rows.map(rowToEvent);
};

// Sync needs tombstones too, or a stale file entry could resurrect an event
// the user deleted.
export const getAllEventsForSync = async () => {
  const db = await getDb();
  const rows = await db.getAllAsync('SELECT * FROM events ORDER BY date ASC');
  return rows.map(rowToEvent);
};

// Local edits stamp updated_at = now. The sync path passes
// { keepUpdatedAt: true } so merge-decided timestamps are written through
// untouched (same rule as the Forge: local edits stamp, sync does not).
export const saveEvent = async (event, { keepUpdatedAt = false } = {}) => {
  const db = await getDb();
  const now = Date.now();
  const stamp = keepUpdatedAt ? (event.updatedAt || 0) : now;
  await db.runAsync(
    `INSERT INTO events (id, title, description, location, date, end_date, start_time, end_time, all_day, category_id, recurrence, recurrence_interval, recurrence_until, reminders, exdates, created_at, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       location = excluded.location,
       date = excluded.date,
       end_date = excluded.end_date,
       start_time = excluded.start_time,
       end_time = excluded.end_time,
       all_day = excluded.all_day,
       category_id = excluded.category_id,
       recurrence = excluded.recurrence,
       recurrence_interval = excluded.recurrence_interval,
       recurrence_until = excluded.recurrence_until,
       reminders = excluded.reminders,
       exdates = excluded.exdates,
       updated_at = excluded.updated_at,
       deleted = excluded.deleted`,
    [
      event.id, event.title, event.description, event.location,
      event.date, event.endDate || '', event.startTime, event.endTime,
      event.allDay ? 1 : 0, event.categoryId,
      event.recurrence || 'none',
      Math.max(1, Math.floor(event.recurrenceInterval || 1)),
      event.recurrenceUntil || '',
      JSON.stringify(Array.isArray(event.reminders) ? event.reminders : [0]),
      JSON.stringify(Array.isArray(event.exdates) ? event.exdates : []),
      event.createdAt || now, stamp,
      event.deleted ? 1 : 0,
    ]
  );
};

// Soft delete: a tombstone with a fresh updated_at, never a row removal, so
// the deletion can sync.
export const deleteEvent = async (id) => {
  const db = await getDb();
  await db.runAsync('UPDATE events SET deleted = 1, updated_at = ? WHERE id = ?', [Date.now(), id]);
};

// Persist merge-decided records (live or tombstone) with their own
// timestamps. Tombstones keep any existing row's content; only the flag and
// timestamp change.
export const applySyncChanges = async (changed) => {
  const db = await getDb();
  for (const e of changed) {
    if (e.deleted) {
      const res = await db.runAsync(
        'UPDATE events SET deleted = 1, updated_at = ? WHERE id = ?', [e.updatedAt || 0, e.id]
      );
      if (!res.changes) {
        await saveEvent({ ...e, title: e.title || '', date: e.date || '', deleted: true }, { keepUpdatedAt: true });
      }
    } else {
      await saveEvent(e, { keepUpdatedAt: true });
    }
  }
};

// ─── Settings (device-local key/value; never synced) ───
export const getSetting = async (key, fallback = '') => {
  const db = await getDb();
  const row = await db.getFirstAsync('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : fallback;
};

export const setSetting = async (key, value) => {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, String(value ?? '')]
  );
};

// ─── Category CRUD ───
export const getAllCategories = async () => {
  const db = await getDb();
  const rows = await db.getAllAsync('SELECT id, name, color FROM categories ORDER BY sort_order ASC, name ASC');
  return rows;
};

export const saveCategory = async (cat) => {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO categories (id, name, color, sort_order)
     VALUES (?, ?, ?, COALESCE((SELECT sort_order FROM categories WHERE id = ?), (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories)))
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       color = excluded.color`,
    [cat.id, cat.name, cat.color, cat.id]
  );
};

export const deleteCategory = async (id, fallbackId) => {
  const db = await getDb();
  // Reassign any events using this category to the fallback
  if (fallbackId) {
    await db.runAsync('UPDATE events SET category_id = ? WHERE category_id = ?', [fallbackId, id]);
  }
  await db.runAsync('DELETE FROM categories WHERE id = ?', [id]);
};

export const newCategory = (overrides = {}) => ({
  id:    `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  name:  'New Category',
  color: '#c9a84c',
  ...overrides,
});

// ─── Helpers ───
export const eventsForDate = (events, isoDate) => {
  return events.filter(e => {
    if (e.endDate && e.endDate >= e.date) {
      return isoDate >= e.date && isoDate <= e.endDate;
    }
    return e.date === isoDate;
  });
};

export const categoryById = (categories, id) =>
  categories.find(c => c.id === id) || { id, name: id, color: '#7a7060' };
