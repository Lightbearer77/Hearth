// ─── Recurrence engine ───
// One master event row + virtual expansion at read time. Occurrence dates
// are computed on demand; nothing is ever duplicated in the database.
//
// Rules (v1 ratified 2026-07-08; multi-day repeat added 2026-07-11):
//   · Repeating events may span multiple days: every occurrence keeps the
//     master's duration (endDate − date). exdates refer to occurrence START
//     dates and remove the whole span.
//   · No series end date yet — expansion is always range-bounded, so an
//     open-ended series is safe.
//   · Custom intervals: recurrenceInterval N ≥ 1 means "every Nth step" of
//     the unit ('daily' + 3 = every 3 days). Legacy 'biweekly' rows are
//     understood as weekly × 2.
//   · Per-occurrence exceptions: event.exdates (array of ISO dates) are
//     skipped during expansion. "Edit one occurrence" = detach a standalone
//     copy + exdate the original slot; "delete one occurrence" = exdate only.
//
// Options: none | daily | weekly | biweekly | monthly | yearly | greekMonthly
//   monthly      Gregorian day-of-month; months lacking that day are skipped
//                (Jan 31 master → no February occurrence), matching standard
//                calendar behavior.
//   yearly       Same Gregorian month/day; a Feb 29 master occurs only in
//                leap years.
//   greekMonthly Same Greek day (1–28) in every Greek month — the option no
//                Gregorian calendar can offer. A Planning Day master degrades
//                to yearly (Dec 31), since Planning Day belongs to no month.

import { gregToGreek, greekToGreg, GREEK_MONTHS } from './constants';

// Quick picks shown as chips; custom N×unit built on the same ids.
export const RECURRENCE_OPTIONS = [
  { id: 'none',         label: 'Does not repeat' },
  { id: 'daily',        label: 'Daily' },
  { id: 'weekly',       label: 'Weekly' },
  { id: 'monthly',      label: 'Monthly' },
  { id: 'yearly',       label: 'Yearly' },
  { id: 'greekMonthly', label: 'Every Greek month' },
];

export const CUSTOM_UNITS = [
  { id: 'daily',        singular: 'day',         plural: 'days' },
  { id: 'weekly',       singular: 'week',        plural: 'weeks' },
  { id: 'monthly',      singular: 'month',       plural: 'months' },
  { id: 'yearly',       singular: 'year',        plural: 'years' },
  { id: 'greekMonthly', singular: 'Greek month', plural: 'Greek months' },
];

// "Every 3 weeks", "Weekly", "Every Greek month" — for chips/summaries.
export const recurrenceLabel = (rec, interval = 1) => {
  if (!rec || rec === 'none') return 'Does not repeat';
  if (rec === 'biweekly') { rec = 'weekly'; interval = 2; }   // legacy
  const unit = CUSTOM_UNITS.find(u => u.id === rec);
  if (!unit) return 'Repeats';
  if (interval <= 1) {
    return RECURRENCE_OPTIONS.find(o => o.id === rec)?.label || `Every ${unit.singular}`;
  }
  return `Every ${interval} ${unit.plural}`;
};

const normalizeRec = (event) => {
  let rec = event.recurrence || 'none';
  let interval = Math.max(1, Math.floor(event.recurrenceInterval || 1));
  if (rec === 'biweekly') { rec = 'weekly'; interval = 2; }   // legacy rows
  return { rec, interval };
};

const exdateSet = (event) =>
  new Set(Array.isArray(event.exdates) ? event.exdates : []);

const toISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromISO = (iso) => new Date(iso + 'T12:00:00');
const clampISO = (a, b) => (a > b ? a : b);

export const addDaysISO = (iso, n) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

// Whole-day span length beyond the start (0 for single-day events).
export const durationDays = (event) => {
  if (!event?.endDate || event.endDate <= event.date) return 0;
  return Math.round((fromISO(event.endDate) - fromISO(event.date)) / 86400000);
};

// All occurrence dates (ISO strings) of `event` within [rangeStartISO,
// rangeEndISO], inclusive. Non-recurring events return their own date if it
// falls in range (multi-day handled by the caller's existing range logic).
export const expandOccurrences = (event, rangeStartISO, rangeEndISO) => {
  if (!event?.date || rangeEndISO < event.date) return [];
  const { rec, interval } = normalizeRec(event);

  if (rec === 'none') {
    return event.date >= rangeStartISO && event.date <= rangeEndISO
      ? [event.date] : [];
  }

  const skip = exdateSet(event);
  // Occurrences never precede the master date.
  const start = clampISO(rangeStartISO, event.date);
  const out = [];
  const push = (iso) => { if (!skip.has(iso)) out.push(iso); };

  if (rec === 'daily' || rec === 'weekly') {
    const step = (rec === 'daily' ? 1 : 7) * interval;
    const master = fromISO(event.date);
    const first = fromISO(start);
    const elapsed = Math.round((first - master) / 86400000);
    const offset = ((step - (elapsed % step)) % step);
    const cur = new Date(first);
    cur.setDate(cur.getDate() + offset);
    while (toISO(cur) <= rangeEndISO) {
      push(toISO(cur));
      cur.setDate(cur.getDate() + step);
    }
    return out;
  }

  if (rec === 'monthly') {
    const master = fromISO(event.date);
    const dom = master.getDate();
    // Walk in interval-sized month steps FROM THE MASTER so "every 3
    // months" stays anchored to the master's month, not the range's.
    let y = master.getFullYear();
    let m = master.getMonth();
    const endYear = parseInt(rangeEndISO.slice(0, 4), 10);
    while (y <= endYear + 1) {
      const cand = new Date(y, m, dom, 12);
      if (cand.getDate() === dom) {           // month actually has this day
        const iso = toISO(cand);
        if (iso > rangeEndISO) break;
        if (iso >= start) push(iso);
      } else if (toISO(new Date(y, m, 1, 12)).slice(0, 7) > rangeEndISO.slice(0, 7)) {
        break;
      }
      m += interval;
      while (m > 11) { m -= 12; y++; }
    }
    return out;
  }

  if (rec === 'yearly') {
    const masterYear = parseInt(event.date.slice(0, 4), 10);
    const mm = event.date.slice(5, 7);
    const dd = event.date.slice(8, 10);
    const yEnd = parseInt(rangeEndISO.slice(0, 4), 10);
    for (let y = masterYear; y <= yEnd; y += interval) {
      const cand = new Date(y, parseInt(mm, 10) - 1, parseInt(dd, 10), 12);
      if (cand.getDate() !== parseInt(dd, 10)) continue; // Feb 29 in common years
      const iso = toISO(cand);
      if (iso >= start && iso <= rangeEndISO) push(iso);
    }
    return out;
  }

  if (rec === 'greekMonthly') {
    const g = gregToGreek(event.date);
    if (!g) return [];
    // Planning Day master: no month membership → behaves as yearly Dec 31,
    // stepped by the interval in years.
    if (g.isPlanningDay) {
      const masterYear = parseInt(event.date.slice(0, 4), 10);
      const yEnd = parseInt(rangeEndISO.slice(0, 4), 10);
      for (let y = masterYear; y <= yEnd; y += interval) {
        const iso = `${y}-12-31`;
        if (iso >= start && iso <= rangeEndISO) push(iso);
      }
      return out;
    }
    const day = g.day; // 1–28, valid in every Greek month
    const masterIdx = g.year * 13 + GREEK_MONTHS.findIndex(mm => mm.id === g.monthId);
    const yStart = parseInt(start.slice(0, 4), 10) - 1; // Greek months span year edges
    const yEnd = parseInt(rangeEndISO.slice(0, 4), 10);
    for (let y = yStart; y <= yEnd; y++) {
      for (let mi = 0; mi < GREEK_MONTHS.length; mi++) {
        const idx = y * 13 + mi;
        if (idx < masterIdx || (idx - masterIdx) % interval !== 0) continue;
        const iso = greekToGreg({ monthId: GREEK_MONTHS[mi].id, day, year: y });
        if (iso && iso >= start && iso <= rangeEndISO) push(iso);
      }
    }
    out.sort();
    return out;
  }

  return [];
};

// Point check: does `event` occur on `isoDate`? Recurring events check the
// series; non-recurring keep the original single/multi-day range semantics.
export const occursOn = (event, isoDate) => {
  if (!event?.date) return false;
  const rec = event.recurrence || 'none';
  if (rec === 'none') {
    if (event.endDate && event.endDate >= event.date) {
      return isoDate >= event.date && isoDate <= event.endDate;
    }
    return event.date === isoDate;
  }
  const dur = durationDays(event);
  if (dur === 0) return expandOccurrences(event, isoDate, isoDate).length > 0;
  // Any occurrence starting within the previous `dur` days covers isoDate.
  const starts = expandOccurrences(event, addDaysISO(isoDate, -dur), isoDate);
  return starts.some(s => s <= isoDate && isoDate <= addDaysISO(s, dur));
};

// Month-view helper: one pass over all events → { iso: [{event, isStart,
// isEnd}] } for the given day list. Recurring events expand once across the
// whole range (with lookback so a span that began before the range still
// covers its in-range days). Each event appears at most once per day even
// when overlapping occurrences cover the same date.
export const eventsByDateInRange = (events, dayISOs) => {
  if (!dayISOs.length) return {};
  const rangeStart = dayISOs[0];
  const rangeEnd = dayISOs[dayISOs.length - 1];
  const map = {};
  const daySet = new Set(dayISOs);
  for (const iso of dayISOs) map[iso] = [];

  const mark = (evt, startISO, dur, seen) => {
    for (let d = 0; d <= dur; d++) {
      const iso = d === 0 ? startISO : addDaysISO(startISO, d);
      if (!daySet.has(iso) || seen.has(iso)) continue;
      seen.add(iso);
      map[iso].push({
        event: evt,
        isStart: d === 0,
        isEnd: d === dur,
      });
    }
  };

  for (const evt of events) {
    const rec = evt.recurrence || 'none';
    const dur = durationDays(evt);
    const seen = new Set();
    if (rec === 'none') {
      mark(evt, evt.date, dur, seen);
    } else {
      const lookback = dur > 0 ? addDaysISO(rangeStart, -dur) : rangeStart;
      for (const startISO of expandOccurrences(evt, lookback, rangeEnd)) {
        mark(evt, startISO, dur, seen);
      }
    }
  }
  return map;
};
