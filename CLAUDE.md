# CLAUDE.md — The Hearth

Instructions for any Claude instance working on this repo. Written by Claude
Fable 5 at handoff (Theta 6, 2026 / Jul 17) after building v1.0 → v1.4.0
with Connor. Read this fully before changing anything.

## What this is

Native Android calendar for Connor's 13-month Greek calendar (Alpha–Nu,
28 days each; Planning Day = Dec 31), integrated with Asatru holidays and
29 AFA Days of Remembrance. Daily-driver replacement for Fossify Calendar.

Stack: Expo SDK 54 · React Native 0.81.5 · expo-sqlite · expo-notifications ·
EAS `preview` profile → standalone APK. Owner `lightbearer77`.

## Settled rulings — do not re-open

1. **Planning Day is Dec 31 only, every year** (Connor's ruling, 2026-07-07).
   The Greek↔Gregorian mapping is perpetual: every Greek date maps to the
   same Gregorian date in all years. Feb 29 in leap years is absorbed into
   Gamma as a doubled **Gamma 3**, flagged `isLeapEcho`. Nu always ends
   Dec 30. `lib/constants.js` implements this; the test suite enforces it.
2. **`lib/constants.js` is shared VERBATIM with the Forge repo.** Any change
   here must be copied there (and vice versa), and both suites must stay
   green. The vault's `greekCal.js` and `GreekCalendar_Reference.md` are the
   other two implementations of this math; the web Forge's constants.js is
   deliberately NOT being patched (it retires before 2028, the first year
   the leap logic matters).
3. **Recurrence is master + virtual expansion** — one row per series, never
   duplicated occurrences. Per-occurrence exceptions are `exdates` (arrays
   of occurrence START dates) on the master; "edit one occurrence" = detach
   a standalone copy + exdate the original slot.
4. **Repeating multi-day events**: every occurrence keeps the master's
   duration (endDate − date). An exdate removes the whole span.
5. **Notifications**: rolling 90-day window, re-scheduled on every launch
   and after any event save/delete. Two Android channels
   (`hearth-holidays`, `hearth-events`). Shared 48-alarm cap, nearest-first.
   Holiday reminders 14/7/1 days before at 9:00; event reminders per-event
   offset arrays (minutes before start; all-day anchors at 9:00).
6. **Sub-day recurrence (minutes/hours) is deliberately excluded** — the
   expansion model is date-based. Flagged to Connor and accepted.

## Architecture map

- `lib/constants.js` — calendar math (see ruling 2 above).
- `lib/holidays.js` — holiday table + `remindersForDate` (checks the date's
  year AND year+1 so late-Dec cells show January reminders).
- `lib/recurrence.js` — expansion engine: daily/weekly/monthly/yearly/
  greekMonthly, custom `recurrenceInterval` (every N units), legacy
  `biweekly` read as weekly×2, `exdates`, durations with lookback,
  `eventsByDateInRange` → `{event, isStart, isEnd}` wrappers, per-day dedupe.
- `lib/storage.js` — SQLite `hearth.db`, schema **v3** via PRAGMA
  user_version runner. CREATE stays v0-shaped; add columns via MIGRATIONS
  only, never by editing CREATE.
- `lib/notifications.js` — `refreshAllNotifications()` is the only scheduler
  entry point.
- `components/` — SeasonalBanner (sideGroup nav, mirror spacer keeps TODAY
  centered), MonthView (memoized dayData; useWindowDimensions for fold
  reflow; spanning title banners with squared continuation edges; spanning
  events sort to the top slot), AgendaView, DayDetail, EventModal (quick
  chips + Custom N×unit; multi-select reminders; occurrence mode),
  SettingsModal.
- `test/run-tests.mjs` — zero deps, self-bootstrapping.
  `npm test` → **3,504 assertions**. Calendar or recurrence changes must
  keep it green AND extend it.

## Punch list (settled with Connor — build in this order)

1. ~~Series end date~~ — DONE in v1.5.0. Schema v4 `recurrence_until`
   (ISO, inclusive, governs occurrence START dates — a span starting on
   the until-date still runs its full duration, same semantics as exdates).
   Single choke point: the range-end clamp at the top of
   `expandOccurrences` covers every mode branch.
2. ~~"This and all future occurrences"~~ — DONE in v1.5.0.
   `splitSeriesAt(master, pivotIso, newId)` in lib/recurrence.js is the
   pure, tested source of truth: old master truncated to pivot−1 with
   past exdates, new master cloned at pivot with future exdates and
   inherited settings; pivot-at-first-occurrence returns a null truncated
   master (caller deletes). Both the chooser draft and the save/delete
   branches in App.js go through it — keep it that way.
3. **Day view** — hour timeline (00–24), events positioned by
   startTime/endTime, all-day strip pinned top; third chip beside
   MONTH/AGENDA.
4. **Search** — in-memory filter over title/notes/location; banner icon;
   results as (Greek date · title) rows opening DayDetail.

Known deferred: **Feb 29 has no dedicated grid cell** (Gamma 3's cell
represents Feb 28+29 in leap years; `isLeapEcho` exists for a future
"28·29" treatment). First real leap year is 2028 — decide before then.
Also: check EventModal for the keyboard-clipping bug found in Forge's
editors (low inputs hidden behind the keyboard; KeyboardAvoidingView
offset/inset tuning).

## Working rules (hard-won; violating these cost days)

- `npx expo install <pkg>` — NEVER plain `npm install <pkg>` for expo-* or
  react-native-* packages. Wrong-version pins (expo-font@56,
  expo-notifications@56) caused a week of launch crashes.
- Local bundle check when EAS fails opaquely:
  `npx expo export --platform android` surfaces the real error. A corrupted
  babel.config.js (shell command text written INTO the file) once produced
  "SyntaxError: index.js: Invalid regular expression flags" — the reported
  filename was WRONG; trust the local export, not the EAS log.
- Babel-parse every changed JS/JSX before pushing. `npm test` before every
  push. Bump app.json version per feature batch.
- `npm audit fix` is banned — it chases semver past SDK 54's pins.
- Push pattern: GitHub Contents API (GET sha → PUT base64). Connor supplies
  a fresh classic PAT per session; tokens appearing in chat are auto-revoked.
- Connor's laptop is Qubes OS: dom0 thin pool can flip the AppVM filesystem
  to `emergency_ro` mid-operation (`mount | grep xvdb`). Playbook: dom0
  fstrim + qube restart; `rm .git/index && git reset HEAD` for index
  corruption; `find .git/objects -size 0 -delete` (then reclone if push
  still fails); verify file sizes after ANY EROFS event — 0-byte writes
  happen silently (an empty package-lock.json once broke EAS installs).
- Verification cycle: Claude builds + tests in sandbox → pushes via API →
  Connor pulls, `npm test`, `eas build --platform android --profile
  preview`, installs APK, runs the device checklist provided per batch.
