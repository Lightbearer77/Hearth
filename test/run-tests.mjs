#!/usr/bin/env node
// ─── Hearth calendar test suite ───
// Run with: npm test  (or: node test/run-tests.mjs)
//
// Zero dependencies. lib/*.js use ESM syntax but the package is CJS, so the
// runner stages copies into a temp dir as .mjs (rewriting relative imports)
// and dynamic-imports them. Nothing is written inside the repo.
//
// This suite is the guard-rail for the perpetual Greek↔Gregorian mapping —
// the math IS the product. Any change to lib/constants.js or lib/holidays.js
// must keep this green.

import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stage = mkdtempSync(join(tmpdir(), 'hearth-test-'));

for (const name of ['constants', 'holidays', 'recurrence']) {
  const src = readFileSync(join(root, 'lib', `${name}.js`), 'utf8')
    .replace(/from '\.\/constants'/g, "from './constants.mjs'");
  writeFileSync(join(stage, `${name}.mjs`), src);
}

const {
  GREEK_MONTHS, gregToGreek, greekToGreg, greekMonthRange, greekMonthDays,
  isLeapYear, fmtGreekLong,
} = await import(pathToFileURL(join(stage, 'constants.mjs')).href);
const { remindersForDate } = await import(pathToFileURL(join(stage, 'holidays.mjs')).href);
const { expandOccurrences, occursOn, eventsByDateInRange } = await import(pathToFileURL(join(stage, 'recurrence.mjs')).href);

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL:', msg); } };
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// ── 1. Full-year sweeps: common, common, leap ──
for (const year of [2026, 2027, 2028]) {
  const leap = isLeapYear(year);
  const daysInYear = leap ? 366 : 365;

  let planningCount = 0, echoCount = 0;
  const d = new Date(year, 0, 1, 12);
  for (let i = 0; i < daysInYear; i++) {
    const s = iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const g = gregToGreek(s);
    ok(g !== null, `${s} maps to null`);
    if (g.isPlanningDay) {
      planningCount++;
      ok(s === `${year}-12-31`, `Planning Day landed on ${s}`);
    } else {
      ok(g.day >= 1 && g.day <= 28, `${s} day out of range: ${g.day}`);
      if (g.isLeapEcho) { echoCount++; ok(s === `${year}-02-29`, `echo on ${s}`); }
      if (!g.isLeapEcho) {
        ok(greekToGreg(g) === s, `roundtrip ${s} -> ${g.monthId} ${g.day} -> ${greekToGreg(g)}`);
      } else {
        ok(greekToGreg(g) === `${year}-02-28`, `echo roundtrip should hit Feb 28, got ${greekToGreg(g)}`);
      }
    }
    d.setDate(d.getDate() + 1);
  }
  ok(planningCount === 1, `${year}: ${planningCount} Planning Days (want exactly 1)`);
  ok(echoCount === (leap ? 1 : 0), `${year}: echo count ${echoCount}`);

  // Month table conformance: computed ranges match the canonical table every year
  for (const m of GREEK_MONTHS) {
    const r = greekMonthRange(m.id, year);
    ok(r.start === `${year}-${m.start}`, `${year} ${m.name} start ${r.start} != ${m.start}`);
    ok(r.end === `${year}-${m.end}`, `${year} ${m.name} end ${r.end} != ${m.end}`);
    ok(greekMonthDays(m.id, year).length === 28, `${year} ${m.name} day count`);
  }
  ok(greekMonthDays('PLANNING', year).length === 1, `${year} Planning has 1 day`);
  ok(greekMonthRange('PLANNING', year).start === `${year}-12-31`, `${year} Planning range`);
}

// ── 2. Anchors — perpetual across common and leap years ──
ok(gregToGreek('2026-06-21').monthId === 'M07' && gregToGreek('2026-06-21').day === 4, 'solstice 2026 = Eta 4');
ok(gregToGreek('2028-06-21').monthId === 'M07' && gregToGreek('2028-06-21').day === 4, 'solstice 2028 = Eta 4 (perpetual)');
ok(gregToGreek('2028-02-28').day === 3 && gregToGreek('2028-02-29').day === 3, 'Feb 28/29 2028 both Gamma 3');
ok(gregToGreek('2028-03-01').monthId === 'M03' && gregToGreek('2028-03-01').day === 4, 'Mar 1 2028 = Gamma 4');
ok(gregToGreek('2028-12-30').monthId === 'M13' && gregToGreek('2028-12-30').day === 28, 'Dec 30 2028 = Nu 28');
ok(gregToGreek('2028-12-31').isPlanningDay === true, 'Dec 31 2028 = Planning');
ok(fmtGreekLong('2026-12-31') === 'Planning Day', 'fmtGreekLong planning');
ok(gregToGreek(new Date(2026, 5, 21, 0, 30)).day === 4, 'Date input 00:30 local = Eta 4 (DST-safe)');

// ── 3. Cross-year reminders ──
ok(remindersForDate('2026-12-26').some(r => r.holiday.id === 'rem_raudr' && r.daysAway === 14 && r.holidayDate === '2027-01-09'),
  'Dec 26 2026 shows 14-day reminder for Goði Rauðr (Jan 9 2027)');
ok(remindersForDate('2027-01-02').some(r => r.holiday.id === 'rem_raudr' && r.daysAway === 7),
  'Jan 2 2027 shows 7-day Rauðr');
ok(remindersForDate('2026-12-24').some(r => r.holiday.id === 'planning_day' && r.daysAway === 7),
  'Dec 24 shows Planning 7-day (same-year)');
ok(remindersForDate('2026-12-26', 2026).some(r => r.holiday.id === 'rem_raudr'),
  'legacy 2-arg call works');

// ── 4. No duplicate reminders across a full year ──
let dupes = 0;
const scan = new Date(2026, 0, 1, 12);
for (let i = 0; i < 365; i++) {
  const s = iso(scan.getFullYear(), scan.getMonth() + 1, scan.getDate());
  const rs = remindersForDate(s);
  const keys = rs.map(r => `${r.holiday.id}|${r.daysAway}|${r.holidayDate}`);
  if (new Set(keys).size !== keys.length) dupes++;
  scan.setDate(scan.getDate() + 1);
}
ok(dupes === 0, `duplicate reminders on ${dupes} days`);

// ── 5. Recurrence engine ──
const ev = (o) => ({ id: 't', date: '2026-07-01', recurrence: 'none', ...o });

// daily
let r = expandOccurrences(ev({ recurrence: 'daily' }), '2026-07-01', '2026-07-10');
ok(r.length === 10 && r[0] === '2026-07-01' && r[9] === '2026-07-10', `daily basic: ${r.length}`);
r = expandOccurrences(ev({ recurrence: 'daily' }), '2026-07-05', '2026-07-07');
ok(r.join(',') === '2026-07-05,2026-07-06,2026-07-07', 'daily mid-range');
ok(expandOccurrences(ev({ recurrence: 'daily' }), '2026-06-01', '2026-06-30').length === 0, 'no occurrences before master');

// weekly / biweekly — including continuation across an arbitrary later range
r = expandOccurrences(ev({ date: '2026-07-08', recurrence: 'weekly' }), '2026-07-01', '2026-07-31');
ok(r.join(',') === '2026-07-08,2026-07-15,2026-07-22,2026-07-29', `weekly july: ${r}`);
r = expandOccurrences(ev({ date: '2026-07-08', recurrence: 'weekly' }), '2026-08-01', '2026-08-31');
ok(r.join(',') === '2026-08-05,2026-08-12,2026-08-19,2026-08-26', `weekly aug continuation: ${r}`);
r = expandOccurrences(ev({ date: '2026-07-08', recurrence: 'biweekly' }), '2026-07-01', '2026-08-31');
ok(r.join(',') === '2026-07-08,2026-07-22,2026-08-05,2026-08-19', `biweekly: ${r}`);

// monthly — Jan 31 master skips short months
r = expandOccurrences(ev({ date: '2026-01-31', recurrence: 'monthly' }), '2026-02-01', '2026-04-30');
ok(r.join(',') === '2026-03-31', `monthly skips Feb+Apr: ${r}`);
r = expandOccurrences(ev({ date: '2026-01-15', recurrence: 'monthly' }), '2026-01-01', '2026-12-31');
ok(r.length === 12, `monthly 15th all year: ${r.length}`);

// yearly — Feb 29 master fires only in leap years
r = expandOccurrences(ev({ date: '2028-02-29', recurrence: 'yearly' }), '2028-01-01', '2033-12-31');
ok(r.join(',') === '2028-02-29,2032-02-29', `yearly leap master: ${r}`);
r = expandOccurrences(ev({ date: '2026-07-08', recurrence: 'yearly' }), '2026-01-01', '2028-12-31');
ok(r.length === 3, `yearly basic: ${r.length}`);

// greekMonthly — same Greek day every month
r = expandOccurrences(ev({ date: '2026-06-18', recurrence: 'greekMonthly' }), '2026-06-18', '2026-08-31');
ok(r.join(',') === '2026-06-18,2026-07-16,2026-08-13', `greekMonthly Eta1/Theta1/Iota1: ${r}`);
r = expandOccurrences(ev({ date: '2026-06-18', recurrence: 'greekMonthly' }), '2027-01-01', '2027-12-31');
ok(r.length === 13, `greekMonthly full year = 13 months: ${r.length}`);
r = expandOccurrences(ev({ date: '2026-06-18', recurrence: 'greekMonthly' }), '2026-12-01', '2027-01-31');
ok(r.join(',') === '2026-12-03,2027-01-01,2027-01-29', `greekMonthly year boundary Nu1/Alpha1/Beta1: ${r}`);
r = expandOccurrences(ev({ date: '2026-12-31', recurrence: 'greekMonthly' }), '2026-12-01', '2028-12-31');
ok(r.join(',') === '2026-12-31,2027-12-31,2028-12-31', `greekMonthly Planning master -> yearly: ${r}`);

// occursOn — recurring point checks + preserved multi-day semantics
ok(occursOn(ev({ date: '2026-07-08', recurrence: 'weekly' }), '2026-07-15') === true, 'occursOn weekly hit');
ok(occursOn(ev({ date: '2026-07-08', recurrence: 'weekly' }), '2026-07-16') === false, 'occursOn weekly miss');
ok(occursOn(ev({ date: '2026-07-01', endDate: '2026-07-03' }), '2026-07-02') === true, 'occursOn multi-day preserved');
ok(occursOn(ev({ recurrence: 'daily' }), '2026-06-30') === false, 'occursOn before master');

// eventsByDateInRange — mixed set over a day list
const days7 = ['2026-07-06','2026-07-07','2026-07-08','2026-07-09','2026-07-10','2026-07-11','2026-07-12'];
const mixed = [
  ev({ id: 'a', recurrence: 'daily' }),
  ev({ id: 'b', date: '2026-07-08' }),
  ev({ id: 'c', date: '2026-07-09', endDate: '2026-07-11' }),
  ev({ id: 'd', date: '2026-07-01', recurrence: 'weekly' }),
];
const map7 = eventsByDateInRange(mixed, days7);
ok(map7['2026-07-08'].map(e=>e.id).sort().join(',') === 'a,b,d', `map Jul8: ${map7['2026-07-08'].map(e=>e.id)}`);
ok(map7['2026-07-10'].map(e=>e.id).sort().join(',') === 'a,c', `map Jul10: ${map7['2026-07-10'].map(e=>e.id)}`);
ok(map7['2026-07-06'].map(e=>e.id).join(',') === 'a', `map Jul6: ${map7['2026-07-06'].map(e=>e.id)}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
