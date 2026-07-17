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

for (const name of ['constants', 'holidays', 'recurrence', 'dayLayout']) {
  const src = readFileSync(join(root, 'lib', `${name}.js`), 'utf8')
    .replace(/from '\.\/constants'/g, "from './constants.mjs'");
  writeFileSync(join(stage, `${name}.mjs`), src);
}

const {
  GREEK_MONTHS, gregToGreek, greekToGreg, greekMonthRange, greekMonthDays,
  isLeapYear, fmtGreekLong,
} = await import(pathToFileURL(join(stage, 'constants.mjs')).href);
const { remindersForDate } = await import(pathToFileURL(join(stage, 'holidays.mjs')).href);
const { expandOccurrences, occursOn, eventsByDateInRange, recurrenceLabel, durationDays, addDaysISO, splitSeriesAt } = await import(pathToFileURL(join(stage, 'recurrence.mjs')).href);
const { layoutDayEvents, searchEvents } = await import(pathToFileURL(join(stage, 'dayLayout.mjs')).href);

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
ok(map7['2026-07-08'].map(x=>x.event.id).sort().join(',') === 'a,b,d', `map Jul8: ${map7['2026-07-08'].map(x=>x.event.id)}`);
ok(map7['2026-07-10'].map(x=>x.event.id).sort().join(',') === 'a,c', `map Jul10: ${map7['2026-07-10'].map(x=>x.event.id)}`);
ok(map7['2026-07-06'].map(x=>x.event.id).join(',') === 'a', `map Jul6: ${map7['2026-07-06'].map(x=>x.event.id)}`);

// ── 6. Custom intervals + exceptions ──
// every 3 days
r = expandOccurrences(ev({ recurrence: 'daily', recurrenceInterval: 3 }), '2026-07-01', '2026-07-15');
ok(r.join(',') === '2026-07-01,2026-07-04,2026-07-07,2026-07-10,2026-07-13', `every 3 days: ${r}`);
// every 3 days, mid-range window still phase-locks to master
r = expandOccurrences(ev({ recurrence: 'daily', recurrenceInterval: 3 }), '2026-07-05', '2026-07-12');
ok(r.join(',') === '2026-07-07,2026-07-10', `every 3 days mid-range: ${r}`);
// legacy biweekly rows == weekly x2
r = expandOccurrences(ev({ date: '2026-07-08', recurrence: 'biweekly' }), '2026-07-01', '2026-08-31');
const r2 = expandOccurrences(ev({ date: '2026-07-08', recurrence: 'weekly', recurrenceInterval: 2 }), '2026-07-01', '2026-08-31');
ok(r.join(',') === r2.join(','), `legacy biweekly == weekly x2: ${r} vs ${r2}`);
// every 2 months anchored to master (Jan 15 -> Jan,Mar,May,...)
r = expandOccurrences(ev({ date: '2026-01-15', recurrence: 'monthly', recurrenceInterval: 2 }), '2026-01-01', '2026-12-31');
ok(r.join(',') === '2026-01-15,2026-03-15,2026-05-15,2026-07-15,2026-09-15,2026-11-15', `every 2 months: ${r}`);
// every 2 months from Jan 31: candidate months Jan,Mar,May,Jul,Sep,Nov all have 31 except Sep,Nov
r = expandOccurrences(ev({ date: '2026-01-31', recurrence: 'monthly', recurrenceInterval: 2 }), '2026-01-01', '2026-12-31');
ok(r.join(',') === '2026-01-31,2026-03-31,2026-05-31,2026-07-31', `every 2 months day-31 skips: ${r}`);
// every 2 years
r = expandOccurrences(ev({ date: '2026-07-08', recurrence: 'yearly', recurrenceInterval: 2 }), '2026-01-01', '2031-12-31');
ok(r.join(',') === '2026-07-08,2028-07-08,2030-07-08', `every 2 years: ${r}`);
// every 2 Greek months (Eta 1 master -> Eta, Iota, Lambda, Nu, Beta...)
r = expandOccurrences(ev({ date: '2026-06-18', recurrence: 'greekMonthly', recurrenceInterval: 2 }), '2026-06-01', '2026-12-31');
ok(r.join(',') === '2026-06-18,2026-08-13,2026-10-08,2026-12-03', `every 2 Greek months: ${r}`);
// exdates: skip one weekly occurrence
r = expandOccurrences(ev({ date: '2026-07-08', recurrence: 'weekly', exdates: ['2026-07-22'] }), '2026-07-01', '2026-07-31');
ok(r.join(',') === '2026-07-08,2026-07-15,2026-07-29', `exdate skipped: ${r}`);
ok(occursOn(ev({ date: '2026-07-08', recurrence: 'weekly', exdates: ['2026-07-22'] }), '2026-07-22') === false, 'occursOn respects exdate');
ok(occursOn(ev({ date: '2026-07-08', recurrence: 'weekly', exdates: ['2026-07-22'] }), '2026-07-29') === true, 'occursOn after exdate');
// exdate on the master date itself
r = expandOccurrences(ev({ date: '2026-07-08', recurrence: 'weekly', exdates: ['2026-07-08'] }), '2026-07-01', '2026-07-31');
ok(r.join(',') === '2026-07-15,2026-07-22,2026-07-29', `exdate on master: ${r}`);
// labels
ok(recurrenceLabel('weekly', 1) === 'Weekly', 'label weekly');
ok(recurrenceLabel('weekly', 3) === 'Every 3 weeks', 'label every 3 weeks');
ok(recurrenceLabel('biweekly', 1) === 'Every 2 weeks', 'label legacy biweekly');
ok(recurrenceLabel('greekMonthly', 2) === 'Every 2 Greek months', 'label greek interval');

// ── 7. Multi-day repeating events ──
ok(durationDays(ev({ endDate: '2026-07-03' })) === 2, 'durationDays 2');
ok(durationDays(ev({})) === 0 && durationDays(ev({ endDate: '2026-06-30' })) === 0, 'durationDays guards');
ok(addDaysISO('2026-07-30', 3) === '2026-08-02', 'addDaysISO month roll');

// weekly, 2-day span: middle + end days covered, day after span not
const span = ev({ date: '2026-07-08', endDate: '2026-07-10', recurrence: 'weekly' });
ok(occursOn(span, '2026-07-09') === true,  'span middle day');
ok(occursOn(span, '2026-07-10') === true,  'span end day');
ok(occursOn(span, '2026-07-11') === false, 'day after span');
ok(occursOn(span, '2026-07-16') === true,  'next week middle day');
ok(occursOn(span, '2026-07-07') === false, 'day before master');

// exdate removes the whole span of that occurrence
const spanEx = { ...span, exdates: ['2026-07-15'] };
ok(occursOn(spanEx, '2026-07-16') === false, 'exdated occurrence span removed');
ok(occursOn(spanEx, '2026-07-22') === true,  'later occurrence unaffected');

// map: lookback — occurrence starting BEFORE the range still covers in-range days
const aug3 = ['2026-08-01','2026-08-02','2026-08-03'];
const late = ev({ date: '2026-07-30', endDate: '2026-08-01', recurrence: 'monthly' });
const mapAug = eventsByDateInRange([late], aug3);
ok(mapAug['2026-08-01'].length === 1 && mapAug['2026-08-01'][0].isEnd === true && mapAug['2026-08-01'][0].isStart === false,
   `lookback span tail: ${JSON.stringify(mapAug['2026-08-01'])}`);
ok(mapAug['2026-08-02'].length === 0, 'no bleed past span end');

// isStart / isEnd flags across a span
const wk = ['2026-07-06','2026-07-07','2026-07-08','2026-07-09','2026-07-10','2026-07-11','2026-07-12'];
const mapWk = eventsByDateInRange([span], wk);
ok(mapWk['2026-07-08'][0].isStart === true  && mapWk['2026-07-08'][0].isEnd === false, 'span start flags');
ok(mapWk['2026-07-09'][0].isStart === false && mapWk['2026-07-09'][0].isEnd === false, 'span middle flags');
ok(mapWk['2026-07-10'][0].isStart === false && mapWk['2026-07-10'][0].isEnd === true,  'span end flags');

// overlapping occurrences dedupe: daily repeat, 3-day span → once per day
const overlap = ev({ recurrence: 'daily', endDate: '2026-07-03' });
const mapOv = eventsByDateInRange([overlap], ['2026-07-05','2026-07-06']);
ok(mapOv['2026-07-05'].length === 1 && mapOv['2026-07-06'].length === 1, 'overlap dedupe');

// single-day recurring unaffected by span logic
ok(eventsByDateInRange([ev({ recurrence: 'weekly', date: '2026-07-08' })], wk)['2026-07-08'][0].isStart === true, 'single-day isStart+isEnd');

// ══ Series end date (recurrence_until) ══
const mkEvt = (over = {}) => ({ id: 'u1', title: 'U', date: '2026-07-01', endDate: '',
  recurrence: 'daily', recurrenceInterval: 1, recurrenceUntil: '', exdates: [], ...over });

ok(expandOccurrences(mkEvt({ recurrenceUntil: '2026-07-05' }), '2026-07-01', '2026-07-31').length === 5,
   'until: daily clipped to 5');
ok(expandOccurrences(mkEvt({ recurrenceUntil: '2026-07-03' }), '2026-07-01', '2026-07-31').join(',')
   === '2026-07-01,2026-07-02,2026-07-03', 'until: inclusive on the until day');
ok(expandOccurrences(mkEvt({ recurrenceUntil: '2026-06-30' }), '2026-06-01', '2026-07-31').length === 0,
   'until before master: empty series');
ok(expandOccurrences(mkEvt({ recurrence: 'weekly', recurrenceInterval: 2, recurrenceUntil: '2026-08-01' }),
   '2026-07-01', '2026-09-01').join(',') === '2026-07-01,2026-07-15,2026-07-29',
   'until: weekly x2 clipped');
ok(expandOccurrences(mkEvt({ recurrence: 'weekly', recurrenceUntil: '2026-07-07' }),
   '2026-07-01', '2026-07-31').join(',') === '2026-07-01', 'until between occurrences');
ok(expandOccurrences(mkEvt({ recurrence: 'monthly', date: '2026-01-31', recurrenceUntil: '2026-05-31' }),
   '2026-01-01', '2026-12-31').join(',') === '2026-01-31,2026-03-31,2026-05-31',
   'until: monthly (31st) clipped');
ok(expandOccurrences(mkEvt({ recurrence: 'greekMonthly', date: '2026-06-21', recurrenceUntil: '2026-07-20' }),
   '2026-06-01', '2026-12-31').join(',') === '2026-06-21,2026-07-19',
   'until: greekMonthly Eta 4 -> Theta 4 then stop');
ok(occursOn(mkEvt({ recurrenceUntil: '2026-07-05' }), '2026-07-05') === true, 'occursOn: on until day');
ok(occursOn(mkEvt({ recurrenceUntil: '2026-07-05' }), '2026-07-06') === false, 'occursOn: after until');
const spanU = mkEvt({ endDate: '2026-07-03', recurrenceUntil: '2026-07-02' }); // dur 2
ok(occursOn(spanU, '2026-07-04') === true,
   'until governs START dates: span starting on until still covers later days');
ok(occursOn(spanU, '2026-07-05') === false, 'span coverage ends with the last valid start + duration');
ok(expandOccurrences(mkEvt({ recurrence: 'daily', recurrenceInterval: 3, recurrenceUntil: '2026-07-08' }),
   '2026-07-01', '2026-07-31').join(',') === '2026-07-01,2026-07-04,2026-07-07', 'until: every 3 days');
ok(expandOccurrences(mkEvt({ recurrenceUntil: '' }), '2026-07-01', '2026-07-05').length === 5,
   'empty until: open-ended unchanged');

// ══ splitSeriesAt ══
const master = mkEvt({ id: 'm1', recurrence: 'weekly',
  exdates: ['2026-07-08', '2026-07-22'], recurrenceUntil: '2026-09-01' });
const { truncatedMaster: tm, newMaster: nm } = splitSeriesAt(master, '2026-07-15', 'new1');
ok(tm.recurrenceUntil === '2026-07-14', 'split: old series ends day before pivot');
ok(tm.exdates.join(',') === '2026-07-08', 'split: past exdates stay on old master');
ok(tm.id === 'm1' && tm.date === '2026-07-01', 'split: old master identity unchanged');
ok(nm.id === 'new1' && nm.date === '2026-07-15', 'split: new master at pivot under new id');
ok(nm.exdates.join(',') === '2026-07-22', 'split: future exdates migrate');
ok(nm.recurrence === 'weekly' && nm.recurrenceUntil === '2026-09-01',
   'split: recurrence + inherited until preserved');
const spanMaster = mkEvt({ id: 'm2', endDate: '2026-07-03', recurrence: 'weekly', recurrenceUntil: '' });
const spl2 = splitSeriesAt(spanMaster, '2026-07-15', 'new2');
ok(spl2.newMaster.endDate === '2026-07-17', 'split: duration preserved on new master');
const spl3 = splitSeriesAt(mkEvt({ id: 'm3' }), '2026-07-01', 'new3');
ok(spl3.truncatedMaster === null, 'split at first occurrence: old master deleted, not truncated');
ok(spl3.newMaster.date === '2026-07-01' && spl3.newMaster.id === 'new3', 'split at first: clean relocation');
const spl4 = splitSeriesAt(mkEvt({ id: 'm4', exdates: ['2026-07-15'] }), '2026-07-15', 'new4');
ok(spl4.newMaster.exdates.join(',') === '2026-07-15', 'split: exdate exactly at pivot goes to new master');

// ══ Day layout: overlap clustering + column assignment ══
const L = (arr) => layoutDayEvents(arr.map(([id, s, e]) => ({ id, startMin: s, endMin: e })));
const byId = (res) => Object.fromEntries(res.map(r => [r.id, r]));

let lay = byId(L([['a', 540, 600], ['b', 720, 780]]));
ok(lay.a.cols === 1 && lay.b.cols === 1, 'layout: disjoint events full width');

lay = byId(L([['a', 540, 660], ['b', 600, 700]]));
ok(lay.a.cols === 2 && lay.b.cols === 2 && lay.a.col !== lay.b.col, 'layout: overlapping pair splits');

lay = byId(L([['a', 540, 600], ['b', 600, 660]]));
ok(lay.a.cols === 1 && lay.b.cols === 1, 'layout: touching events do not overlap');

lay = byId(L([['a', 540, 660], ['b', 600, 720], ['c', 660, 780]]));
ok(lay.a.cols === 2 && lay.b.cols === 2 && lay.c.cols === 2, 'layout: chained cluster shares width');
ok(lay.a.col === 0 && lay.b.col === 1 && lay.c.col === 0, 'layout: chain reuses freed column');

lay = byId(L([['a', 540, 700], ['b', 560, 700], ['c', 580, 700]]));
ok(lay.a.cols === 3 && new Set([lay.a.col, lay.b.col, lay.c.col]).size === 3, 'layout: triple stack three columns');

lay = byId(L([['a', 540, 660], ['b', 600, 700], ['c', 720, 780], ['d', 730, 790]]));
ok(lay.a.cols === 2 && lay.c.cols === 2 && lay.c.col === 0, 'layout: clusters independent, columns reset');

ok(L([]).length === 0, 'layout: empty input');
lay = byId(L([['a', 540, 540]]));
ok(lay.a.cols === 1, 'layout: zero-duration event tolerated');

// ══ searchEvents ══
const sEvts = [
  { id: 's1', title: 'Blot ceremony', description: '', location: '', date: '2026-03-01' },
  { id: 's2', title: 'Dentist', description: 'bring insurance CARD', location: '', date: '2026-02-01' },
  { id: 's3', title: 'Gym', description: '', location: 'Layton rec center', date: '2026-01-15' },
];
ok(searchEvents(sEvts, 'blot').length === 1, 'search: title case-insensitive');
ok(searchEvents(sEvts, 'card')[0].id === 's2', 'search: description match');
ok(searchEvents(sEvts, 'layton')[0].id === 's3', 'search: location match');
ok(searchEvents(sEvts, '  ').length === 0, 'search: whitespace query empty');
ok(searchEvents(sEvts, 'zzz').length === 0, 'search: no matches');
const sAll = searchEvents(sEvts, 'e');
ok(sAll.length === 3 && sAll[0].id === 's3', 'search: results sorted by date');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
