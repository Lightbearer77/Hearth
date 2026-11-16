// ─── hearth-sync.json: the Claude ⇄ Hearth bridge ───
//
// Same protocol family as the Forge's forge-sync.json, for calendar events.
//
// PROTOCOL (v1):
//   {
//     "version": 1,
//     "lastUpdated": "<ISO-8601>",
//     "updatedBy": "Claude" | "Hearth" | <agent>,
//     "events": [ { ...camelCase event fields, updatedAt: <ms>, deleted?: true } ]
//   }
//
// SEMANTICS — the load-bearing rules (identical to the Forge's):
//   · The file is a set of UPSERTS and TOMBSTONES. An event absent from the
//     file means "no opinion". Partial patches and full snapshots are both
//     valid files. Absence NEVER deletes.
//   · Deletion is an explicit tombstone: { id, updatedAt, deleted: true }.
//   · Conflict resolution is whole-event last-write-wins on `updatedAt` (ms).
//     STRICTLY greater wins; a tie keeps local. No field-level merging, ever.
//   · Tombstones are symmetric: a newer tombstone kills a live event; a
//     newer live edit resurrects a tombstoned one.
//   · Categories are NOT synced. Events reference a categoryId; an unknown
//     id still renders (categoryById falls back to a neutral color).
//
// The file lives in a PRIVATE repo (Lightbearer77/Lightbearer77-hearth-sync). The app
// reads and writes it through the GitHub Contents API with an on-device
// fine-grained token (that repo only, Contents read/write). Reads use the
// API, not raw.githubusercontent, so there is no CDN staleness.
//
// USAGE CONTRACT: mergeSyncFile must receive local events INCLUDING
// tombstones, or a stale file entry could resurrect a deleted event.

export const SYNC_FILE_VERSION = 1;
export const SYNC_REPO = 'Lightbearer77/Lightbearer77-hearth-sync';
export const SYNC_PATH = 'hearth-sync.json';
export const SYNC_API = `https://api.github.com/repos/${SYNC_REPO}/contents/${SYNC_PATH}`;

const RECURRENCE_IDS = ['none', 'daily', 'weekly', 'monthly', 'yearly', 'greekMonthly'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const str = (v) => (typeof v === 'string' ? v : '');
const isoOrEmpty = (v) => (typeof v === 'string' && ISO_DATE.test(v) ? v : '');
const timeOrEmpty = (v) => (typeof v === 'string' && HHMM.test(v) ? v : '');
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

// Tolerant inbound mapper. Returns a clean event, a tombstone, or null when
// the record is unusable (caller counts it as skipped).
export const normalizeEvent = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) return null;
  const updatedAt = num(raw.updatedAt, 0);

  if (raw.deleted === true) {
    return { id, deleted: true, updatedAt, title: str(raw.title), date: isoOrEmpty(raw.date) };
  }

  const title = str(raw.title).trim();
  const date = isoOrEmpty(raw.date);
  if (!title || !date) return null;

  let endDate = isoOrEmpty(raw.endDate);
  if (endDate && endDate < date) endDate = '';

  const allDay = raw.allDay === true || raw.allDay === 1;
  const recurrence = RECURRENCE_IDS.includes(raw.recurrence) ? raw.recurrence : 'none';
  const reminders = Array.isArray(raw.reminders)
    ? raw.reminders.filter(n => Number.isFinite(n) && n >= 0).map(n => Math.floor(n))
    : [0];
  const exdates = Array.isArray(raw.exdates) ? raw.exdates.filter(d => ISO_DATE.test(d)) : [];

  return {
    id,
    title,
    description: str(raw.description),
    location: str(raw.location),
    date,
    endDate,
    startTime: allDay ? '' : timeOrEmpty(raw.startTime),
    endTime: allDay ? '' : timeOrEmpty(raw.endTime),
    allDay,
    categoryId: str(raw.categoryId) || 'G1',
    recurrence,
    recurrenceInterval: Math.max(1, Math.floor(num(raw.recurrenceInterval, 1))),
    recurrenceUntil: isoOrEmpty(raw.recurrenceUntil),
    reminders,
    exdates,
    createdAt: num(raw.createdAt, updatedAt),
    updatedAt,
    deleted: false,
  };
};

const emptyReport = () =>
  ({ inserted: 0, updated: 0, deletedApplied: 0, localWon: 0, skipped: 0, total: 0 });

// Pure merge. Returns:
//   merged  — full post-merge event list (tombstones included)
//   changed — only the records that need persisting locally
//   report  — counts for the UI
export const mergeSyncFile = (localEvents, fileJson) => {
  const report = emptyReport();
  const byId = new Map();
  for (const e of localEvents) byId.set(e.id, e);
  const changed = [];

  const incoming = Array.isArray(fileJson?.events) ? fileJson.events : [];
  report.total = incoming.length;

  for (const raw of incoming) {
    const inc = normalizeEvent(raw);
    if (!inc) { report.skipped++; continue; }
    const local = byId.get(inc.id);
    if (!local) {
      byId.set(inc.id, inc);
      changed.push(inc);
      if (inc.deleted) report.deletedApplied++; else report.inserted++;
      continue;
    }
    if ((inc.updatedAt || 0) > (local.updatedAt || 0)) {
      byId.set(inc.id, inc);
      changed.push(inc);
      if (inc.deleted && !local.deleted) report.deletedApplied++; else report.updated++;
    } else {
      report.localWon++;
    }
  }
  return { merged: [...byId.values()], changed, report };
};

export const serializeEvents = (events, updatedBy = 'Hearth') => ({
  version: SYNC_FILE_VERSION,
  lastUpdated: new Date().toISOString(),
  updatedBy,
  events,
});

// ─── Network (GitHub Contents API, private repo, on-device token) ───
const authHeaders = (token, accept) => ({
  Authorization: `Bearer ${token}`,
  Accept: accept,
  'X-GitHub-Api-Version': '2022-11-28',
});

// btoa handles ASCII only; encode UTF-8 safely for titles with any glyphs.
const toBase64Utf8 = (s) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

// Fetch the sync file. A missing file (404) is a normal pre-first-sync
// state → null, not an error.
export const fetchSyncFile = async (token) => {
  if (!token) throw new Error('No sync token configured (Settings).');
  const res = await fetch(`${SYNC_API}?ref=main&t=${Date.now()}`, {
    headers: authHeaders(token, 'application/vnd.github.raw+json'),
  });
  if (res.status === 404) return null;
  if (res.status === 401 || res.status === 403) {
    throw new Error('Sync token rejected. Check it covers the sync repo with Contents access.');
  }
  if (!res.ok) throw new Error(`Sync fetch failed: HTTP ${res.status}`);
  const json = await res.json();
  if (json?.version !== SYNC_FILE_VERSION) {
    throw new Error(`Unsupported sync file version: ${json?.version}`);
  }
  return json;
};

// Publish the full local state (tombstones included) as a snapshot.
// Discipline: fetch → merge → THEN push. Receivers merge by LWW, so a
// snapshot with stale entries just loses those entries. Pushing cannot
// roll anyone back.
export const pushSyncFile = async ({ token, events }) => {
  if (!token) throw new Error('No sync token configured (Settings).');
  let sha;
  const probe = await fetch(`${SYNC_API}?ref=main&t=${Date.now()}`, {
    headers: authHeaders(token, 'application/vnd.github+json'),
  });
  if (probe.ok) sha = (await probe.json()).sha;
  else if (probe.status !== 404) throw new Error(`Sync push probe failed: HTTP ${probe.status}`);

  const body = serializeEvents(events, 'Hearth');
  const res = await fetch(SYNC_API, {
    method: 'PUT',
    headers: { ...authHeaders(token, 'application/vnd.github+json'), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Hearth push: ${events.length} events`,
      content: toBase64Utf8(JSON.stringify(body, null, 2)),
      branch: 'main',
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Sync push failed: HTTP ${res.status} ${detail.slice(0, 120)}`);
  }
  return { pushed: events.length };
};
