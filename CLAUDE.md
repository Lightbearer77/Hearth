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
7. **Tasks: carry-over is computed at read time, never by moving dates**
   (v1.8.0). A task keeps the `date` it was created for. `tasksForDate`
   shows a carry-over task on every day from that date through its
   completion day (or through today while still open); nothing is projected
   into the future. Do NOT add a midnight job that bumps dates — Android
   background execution is unreliable and it would erase when a task began.
   Checking a task off from a past day stamps THAT day (`completionStamp`),
   so the tap is visible; from a future day it stamps today.
8. **Hearth never writes to `forge-sync.json`** (Connor's ruling, 2026-10-29).
   Forge "Push State" overwrites GitHub with the phone's raw snapshot, so a
   Hearth-side write would be silently lost. The day sheet's THIS WEEK ·
   FORGE list is a read-only view of the Forge's **In Progress** lane
   (status `in-progress`) — Connor moves his weekly-planning picks there in
   the Forge, Pushes, and checks them off in the Forge. Hearth-only tasks live
   in the local `tasks` table. The Forge has no URL scheme, so tapping a pick
   just opens the Forge app (no per-task deep link, by choice).

## Architecture map

- `lib/constants.js` — calendar math (see ruling 2 above).
- `lib/holidays.js` — holiday table + `remindersForDate` (checks the date's
  year AND year+1 so late-Dec cells show January reminders).
- `lib/recurrence.js` — expansion engine: daily/weekly/monthly/yearly/
  greekMonthly, custom `recurrenceInterval` (every N units), legacy
  `biweekly` read as weekly×2, `exdates`, durations with lookback,
  `eventsByDateInRange` → `{event, isStart, isEnd}` wrappers, per-day dedupe.
- `lib/storage.js` — SQLite `hearth.db`, schema **v6** via PRAGMA
  user_version runner. CREATE stays v0-shaped; add columns via MIGRATIONS
  only, never by editing CREATE. v5 adds the `tasks` and `kv` tables (both
  `CREATE TABLE IF NOT EXISTS`, so idempotent). The suite asserts
  SCHEMA_VERSION equals the highest migration key.
- `lib/notifications.js` — `refreshAllNotifications()` is the only scheduler
  entry point.
- `lib/tasks.js` — PURE, tested: Hearth-only task model + `tasksForDate`
  (carry-over computed at read time), `toggleDone` / `toggleCarry`, and the
  Forge-picks filter (`forgePicksFromSync`). Imports nothing, so the node
  runner loads it directly.
- `lib/forgeSync.js` — READ-ONLY fetch of the public `forge-sync.json`, cached
  in the `kv` table for offline use. `lib/openForge.js` launches the Forge app.
  Neither ever writes to the Forge.
- `components/` — SeasonalBanner (sideGroup nav, mirror spacer keeps TODAY
  centered), MonthView (memoized dayData; useWindowDimensions for fold
  reflow; spanning title banners with squared continuation edges; spanning
  events sort to the top slot), AgendaView, DayDetail, EventModal (quick
  chips + Custom N×unit; multi-select reminders; occurrence mode),
  SettingsModal.
- `test/run-tests.mjs` — zero deps, self-bootstrapping.
  `npm test` → **3,731 assertions**. Calendar or recurrence changes must
  keep it green AND extend it.

## Sync: hearth-sync.json (v1.9.0) — the Claude ⇄ Hearth bridge

Same protocol family as the Forge's forge-sync.json, for calendar events.
The file lives in the **PRIVATE** repo `Lightbearer77/Lightbearer77-hearth-sync` (events
are personal; do NOT move it to a public repo). The app pulls on launch and
via Settings ⟳ SYNC; Settings → PUSH STATE publishes a full snapshot. Auth
is an on-device fine-grained token (that repo only, Contents RW) in the
device-local `settings` table (never synced). Reads go through the GitHub
Contents API, so there is no raw-CDN staleness.

Rules (identical to the Forge's — do not re-open):
- Whole-event LWW on `updatedAt` (ms); strictly greater wins, tie keeps
  local. No field-level merging.
- Deletion is a tombstone (`events.deleted`, schema v5), never a row
  removal. `getAllEvents()` returns live events only; `getAllEventsForSync()`
  includes tombstones. Tombstones are symmetric with live edits.
- Absence = no opinion. Partial patches and full snapshots are both valid.
- Local edits stamp `updated_at = now`; the sync path calls
  `saveEvent(e, { keepUpdatedAt: true })` so merge-decided timestamps pass
  through untouched.
- Categories are NOT synced. Events carry a `categoryId`; unknown ids render
  neutral. Use G1–G4 / RITUAL / PERSONAL when authoring.
- `lib/sync.js` is pure and unit-tested; `lib/syncRunner.js` is the
  SQLite glue (pull = fetch → merge → persist changed; push = pull first,
  then publish snapshot, so a push never rolls back a newer Claude edit).

**Authoring discipline for Claude instances (violating this silently loses
Connor's data):**
1. Clone `Lightbearer77/Lightbearer77-hearth-sync`; before EVERY publish run
   `git fetch --depth=1 origin main && git reset --hard origin/main` (the
   phone may have pushed).
2. Write `changes.json` = `{ "events": [ ... ] }` with full records and
   `updatedAt: Date.now()`. Required: `id`, `title`, `date` (ISO). Optional:
   `endDate`, `startTime`/`endTime` (HH:MM), `allDay`, `location`,
   `description`, `categoryId`, `reminders` (minutes before start, default
   `[0]`), `recurrence`.
3. `node tools/claude-publish.mjs changes.json <clone>/hearth-sync.json > merged.json`
   — merges with the tested engine and prints counts. Diff the added /
   removed / changed ids against the current file before copying it over.
4. Commit and push to `main`. Tell Connor to ⟳ SYNC in Hearth.
5. Delete = `{ "id": ..., "updatedAt": <now>, "deleted": true }`.
6. Never lower an existing `updatedAt`; never omit it (a missing one is 0
   and loses to any local copy).
Rollout order matters once: install the v1.9.0 APK (it migrates the schema)
and do one PUSH STATE before Claude publishes anything.

Schema note: migration 5 is the day-sheet build's `tasks` + `kv` tables;
migration 6 is sync's `events.deleted` + `settings`. They are separate on
purpose, because a phone that already ran the day-sheet build sits at
user_version 5 and would otherwise never receive the sync columns. Never
reuse or renumber an applied migration.

Ruling 8 (Hearth never writes forge-sync.json) is unaffected: hearth-sync
is a separate private repo and a separate file.

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
3. ~~Day view~~ — DONE in v1.6.0. Hour timeline with the overlap layout
   handled by `layoutDayEvents` in lib/dayLayout.js (pure, tested: cluster
   detection, greedy column assignment, touching-events-don't-overlap).
   Timed single-day events go on the timeline; all-day, untimed, and
   multi-day occurrences go to the top strip. Tap an empty hour to create.
4. ~~Search~~ — DONE in v1.6.0. `searchEvents` (pure, tested) over
   title/description/location; 🔍 in the banner; picking a result jumps
   the day view (and month context) to the event's date.

**v1.7.0 added (Connor's asks):** custom/stacked reminders — EventModal
now shows a Proton-style reminder bin (one removable row per reminder,
quick-add presets, and a custom value+unit composer for arbitrary offsets;
storage & notifications already handled arbitrary minute offsets, so this
was UI-only). Month-view events now sort by time-of-day via the pure,
tested `sortDayEntries` in lib/dayLayout.js — spanning events still take the
top slots (preserved guarantee), then all-day, then timed chronologically.

**v1.8.0 added (Connor's ask): Tasks section in the day sheet.** (1) TASKS:
checkboxes, inline add, per-task ↻ carry toggle (default on), DAY n badge on
carried tasks, delete with confirm. (2) THIS WEEK · FORGE (today's sheet only):
the Forge's In Progress tasks, refreshed on launch, on returning to the app,
and via ↻ REFRESH; shows how long ago the Forge last pushed. Adds the
`expo-intent-launcher` dependency (installed with `npx expo install`).
Not built, by design: month-view dots for open tasks, a daily open-task
notification, editing a task's title (delete and re-add).

**The original punch list is COMPLETE.** Remaining Hearth work is only the
deferred Feb-29 cell decision (before 2028) and the EventModal
keyboard-clip check.

Known deferred: **Feb 29 has no dedicated grid cell** (Gamma 3's cell
represents Feb 28+29 in leap years; `isLeapEcho` exists for a future
"28·29" treatment). First real leap year is 2028 — decide before then.
Keyboard clipping FIXED in v1.7.2: the bug was
`behavior={Platform.OS === 'ios' ? 'padding' : undefined}` — undefined means
KeyboardAvoidingView is inert on Android. Fix = `'height'` on Android, plus
`keyboardShouldPersistTaps="handled"` (so SAVE registers first-tap with the
keyboard up) and bodyContent paddingBottom 220 so the deepest input
(Description) can scroll clear. The SAME bug pattern exists in Forge's
TaskEditor/MilestoneEditor — apply the identical fix there.

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
