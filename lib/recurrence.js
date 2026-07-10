// ─── Recurrence engine ───
// One master event row + virtual expansion at read time. Occurrence dates
// are computed on demand; nothing is ever duplicated in the database.
//
// v1 rules (ratified 2026-07-08):
//   · Series-level edits only — changing/deleting the master affects all
//     occurrences. Per-occurrence exceptions are a future feature.
//   · Repeating events are single-day (endDate is ignored when repeating).
//   · No series end date in v1 — expansion is always range-bounded, so an
//     open-ended series is safe.
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

export const RECURRENCE_OPTIONS = [
  { id: 'none',         label: 'Does not repeat' },
  { id: 'daily',        label: 'Daily' },
  { id: 'weekly',       label: 'Weekly' },
  { id: 'biweekly',     label: 'Every 2 weeks' },
  { id: 'monthly',      label: 'Monthly' },
  { id: 'yearly',       label: 'Yearly' },
  { id: 'greekMonthly', label: 'Every Greek month' },
];

const toISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromISO = (iso) => new Date(iso + 'T12:00:00');
const clampISO = (a, b) => (a > b ? a : b);

// All occurrence dates (ISO strings) of `event` within [rangeStartISO,
// rangeEndISO], inclusive. Non-recurring events return their own date if it
// falls in range (multi-day handled by the caller's existing range logic).
export const expandOccurrences = (event, rangeStartISO, rangeEndISO) => {
  if (!event?.date || rangeEndISO < event.date) return [];
  const rec = event.recurrence || 'none';

  if (rec === 'none') {
    return event.date >= rangeStartISO && event.date <= rangeEndISO
      ? [event.date] : [];
  }

  // Occurrences never precede the master date.
  const start = clampISO(rangeStartISO, event.date);
  const out = [];

  if (rec === 'daily' || rec === 'weekly' || rec === 'biweekly') {
    const step = rec === 'daily' ? 1 : rec === 'weekly' ? 7 : 14;
    const master = fromISO(event.date);
    const first = fromISO(start);
    const elapsed = Math.round((first - master) / 86400000);
    const offset = ((step - (elapsed % step)) % step);
    const cur = new Date(first);
    cur.setDate(cur.getDate() + offset);
    while (toISO(cur) <= rangeEndISO) {
      out.push(toISO(cur));
      cur.setDate(cur.getDate() + step);
    }
    return out;
  }

  if (rec === 'monthly') {
    const master = fromISO(event.date);
    const dom = master.getDate();
    let y = parseInt(start.slice(0, 4), 10);
    let m = parseInt(start.slice(5, 7), 10) - 1;
    while (true) {
      const cand = new Date(y, m, dom, 12);
      // Skip months without this day (Date rolls over, e.g. Feb 31 → Mar)
      if (cand.getDate() === dom) {
        const iso = toISO(cand);
        if (iso > rangeEndISO) break;
        if (iso >= start) out.push(iso);
      } else if (toISO(new Date(y, m, 1, 12)).slice(0, 7) > rangeEndISO.slice(0, 7)) {
        break;
      }
      m++; if (m > 11) { m = 0; y++; }
      if (y > parseInt(rangeEndISO.slice(0, 4), 10) + 1) break;
    }
    return out;
  }

  if (rec === 'yearly') {
    const mm = event.date.slice(5, 7);
    const dd = event.date.slice(8, 10);
    const yStart = parseInt(start.slice(0, 4), 10);
    const yEnd = parseInt(rangeEndISO.slice(0, 4), 10);
    for (let y = yStart; y <= yEnd; y++) {
      const cand = new Date(y, parseInt(mm, 10) - 1, parseInt(dd, 10), 12);
      if (cand.getDate() !== parseInt(dd, 10)) continue; // Feb 29 in common years
      const iso = toISO(cand);
      if (iso >= start && iso <= rangeEndISO) out.push(iso);
    }
    return out;
  }

  if (rec === 'greekMonthly') {
    const g = gregToGreek(event.date);
    if (!g) return [];
    // Planning Day master: no month membership → behaves as yearly Dec 31.
    if (g.isPlanningDay) {
      const yStart = parseInt(start.slice(0, 4), 10);
      const yEnd = parseInt(rangeEndISO.slice(0, 4), 10);
      for (let y = yStart; y <= yEnd; y++) {
        const iso = `${y}-12-31`;
        if (iso >= start && iso <= rangeEndISO) out.push(iso);
      }
      return out;
    }
    const day = g.day; // 1–28, valid in every Greek month
    const yStart = parseInt(start.slice(0, 4), 10) - 1; // Greek months span year edges
    const yEnd = parseInt(rangeEndISO.slice(0, 4), 10);
    for (let y = yStart; y <= yEnd; y++) {
      for (const m of GREEK_MONTHS) {
        const iso = greekToGreg({ monthId: m.id, day, year: y });
        if (iso && iso >= start && iso <= rangeEndISO) out.push(iso);
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
  return expandOccurrences(event, isoDate, isoDate).length > 0;
};

// Month-view helper: one pass over all events → { iso: [events...] } for the
// given day list. Recurring events expand once across the whole range.
export const eventsByDateInRange = (events, dayISOs) => {
  if (!dayISOs.length) return {};
  const rangeStart = dayISOs[0];
  const rangeEnd = dayISOs[dayISOs.length - 1];
  const map = {};
  for (const iso of dayISOs) map[iso] = [];
  for (const evt of events) {
    const rec = evt.recurrence || 'none';
    if (rec === 'none') {
      // Preserve existing single/multi-day semantics
      for (const iso of dayISOs) {
        if (occursOn(evt, iso)) map[iso].push(evt);
      }
    } else {
      for (const iso of expandOccurrences(evt, rangeStart, rangeEnd)) {
        if (map[iso]) map[iso].push(evt);
      }
    }
  }
  return map;
};
