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
});

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
  createdAt: Date.now(),
  ...overrides,
});

// ─── Event CRUD ───
export const getAllEvents = async () => {
  const db = await getDb();
  const rows = await db.getAllAsync('SELECT * FROM events ORDER BY date ASC');
  return rows.map(rowToEvent);
};

export const saveEvent = async (event) => {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO events (id, title, description, location, date, end_date, start_time, end_time, all_day, category_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       location = excluded.location,
       date = excluded.date,
       end_date = excluded.end_date,
       start_time = excluded.start_time,
       end_time = excluded.end_time,
       all_day = excluded.all_day,
       category_id = excluded.category_id`,
    [
      event.id, event.title, event.description, event.location,
      event.date, event.endDate || '', event.startTime, event.endTime,
      event.allDay ? 1 : 0, event.categoryId, event.createdAt || Date.now(),
    ]
  );
};

export const deleteEvent = async (id) => {
  const db = await getDb();
  await db.runAsync('DELETE FROM events WHERE id = ?', [id]);
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
