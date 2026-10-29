// ─── Tasks: Hearth-only checklist + read-only Forge picks ───
// Pure functions, fully covered by the test suite. No expo / RN imports so
// the node test runner can load this file directly.
//
// Two kinds of task reach the day sheet:
//
//   1. HEARTH TASKS — rows in the local `tasks` table. Each has a `date` (the
//      day it was created for), a `carryOver` flag, and a `completedAt` ISO
//      date ('' while open).
//   2. FORGE PICKS — tasks whose status is `in-progress` in forge-sync.json.
//      Hearth only ever READS these. A Forge push overwrites GitHub with the
//      phone's raw snapshot, so anything Hearth wrote there would be lost.
//
// CARRY-OVER IS COMPUTED AT READ TIME. Nothing moves a task's date forward at
// midnight (background jobs are unreliable on Android, and rewriting the date
// would erase when the task started). `tasksForDate` decides visibility from
// the stored dates alone.

const MS_PER_DAY = 86400000;

const isoToDayNumber = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
};

// Whole days from `a` to `b` (both ISO YYYY-MM-DD). Negative when b < a.
export const daysBetween = (a, b) => isoToDayNumber(b) - isoToDayNumber(a);

export const newTask = (overrides = {}) => {
  const now = Date.now();
  return {
    id: `tsk_${now}_${Math.random().toString(36).slice(2, 7)}`,
    title: '',
    date: '',
    carryOver: true,
    completedAt: '',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

// Done *as of* a given day: the task counts as checked on every day from its
// completion day onward, and as open on the days before. This is what makes a
// carried task show honest history ("open on Mon/Tue, done on Wed").
export const isDoneOn = (task, isoDate) =>
  !!task.completedAt && task.completedAt <= isoDate;

// Which day to stamp when the user checks a task off while viewing `viewedIso`.
// Checking from a past day stamps THAT day ("I did this Monday and forgot to
// tick it"); checking from a future day stamps today (you can't have finished
// something tomorrow). Stamping always-today would leave the viewed past day
// unchanged on screen, so the tap would appear to do nothing.
export const completionStamp = (viewedIso, todayIso) =>
  viewedIso > todayIso ? todayIso : viewedIso;

// Check or uncheck a task from the day sheet showing `viewedIso`. The tap
// flips what is DISPLAYED there: done on that day -> reopen; otherwise stamp
// completion (see completionStamp). Returns a new task, never mutates.
export const toggleDone = (task, viewedIso, todayIso) =>
  isDoneOn(task, viewedIso)
    ? { ...task, completedAt: '' }
    : { ...task, completedAt: completionStamp(viewedIso, todayIso) };

// Flip carry-over. Turning it OFF on a task that was completed after its own
// date pulls the completion back onto that date: a non-carry task is only ever
// shown on its own day, and without the clamp it would read as still open
// there even though it was finished.
export const toggleCarry = (task) => {
  const carryOver = !task.carryOver;
  const completedAt =
    !carryOver && task.completedAt && task.completedAt > task.date
      ? task.date
      : task.completedAt;
  return { ...task, carryOver, completedAt };
};

// Tasks visible on `isoDate`, as [{ task, done, dayNumber }], oldest first.
//
//   · On its own date: always.
//   · After its date: only if carryOver, and only up to the day it was
//     completed — or up to today while still open. Nothing is projected into
//     the future; tomorrow's open carry-overs appear when tomorrow arrives.
//   · dayNumber is 1 on the task's own date, 2 the next day, and so on.
export const tasksForDate = (tasks, isoDate, todayIso) => {
  const out = [];
  for (const task of tasks) {
    if (!task || !task.date) continue;
    let visible = false;
    if (task.date === isoDate) {
      visible = true;
    } else if (task.carryOver && task.date < isoDate) {
      const lastDay = task.completedAt || todayIso;
      visible = isoDate <= lastDay;
    }
    if (!visible) continue;
    out.push({
      task,
      done: isDoneOn(task, isoDate),
      dayNumber: daysBetween(task.date, isoDate) + 1,
    });
  }
  return out.sort((a, b) =>
    a.task.createdAt - b.task.createdAt || a.task.id.localeCompare(b.task.id)
  );
};

// ─── Forge picks ───

// Pull this week's picks out of a parsed forge-sync.json: live tasks in the
// In Progress lane. Sorted by due date (undated last), then goal, then name.
export const forgePicksFromSync = (sync) => {
  const list = Array.isArray(sync?.tasks) ? sync.tasks : [];
  const picks = list
    .filter(t => t && !t.deleted && t.status === 'in-progress' && t.name)
    .map(t => ({
      id: String(t.id),
      name: String(t.name),
      goal: String(t.goal || ''),
      section: String(t.section || ''),
      dueDate: String(t.dueDate || ''),
      priority: String(t.priority || ''),
    }));
  return picks.sort((a, b) => {
    if (a.dueDate !== b.dueDate) {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate < b.dueDate ? -1 : 1;
    }
    return a.goal.localeCompare(b.goal) || a.name.localeCompare(b.name);
  });
};

// forge-sync.json's `lastUpdated` (ISO string) as epoch ms; 0 when unusable.
export const syncPushedAt = (sync) => {
  const ms = Date.parse(sync?.lastUpdated || '');
  return Number.isFinite(ms) ? ms : 0;
};

// "just now", "5m ago", "3h ago", "2d ago". Empty string for a missing stamp.
export const relativeAge = (thenMs, nowMs) => {
  if (!thenMs) return '';
  const mins = Math.max(0, Math.floor((nowMs - thenMs) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};
