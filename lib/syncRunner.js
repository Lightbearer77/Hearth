// ─── Sync orchestration (device side) ───
// Glue between the pure merge engine (lib/sync.js) and SQLite storage.
// Pull = fetch file → LWW merge → persist only what changed.
// Push = pull first (so a push can never roll back a newer Claude edit),
// then publish the full local snapshot, tombstones included.

import {
  getAllEventsForSync, applySyncChanges, getSetting,
} from './storage';
import { fetchSyncFile, mergeSyncFile, pushSyncFile } from './sync';

export const SETTING_TOKEN = 'syncToken';
export const SETTING_LAST = 'syncLast';

export const hasSyncToken = async () => !!(await getSetting(SETTING_TOKEN, ''));

export const pullSync = async () => {
  const token = await getSetting(SETTING_TOKEN, '');
  if (!token) return { skipped: true, reason: 'no-token' };
  const file = await fetchSyncFile(token);
  if (!file) return { skipped: false, empty: true, report: null, changed: 0 };
  const local = await getAllEventsForSync();
  const { changed, report } = mergeSyncFile(local, file);
  if (changed.length) await applySyncChanges(changed);
  return { skipped: false, empty: false, report, changed: changed.length };
};

export const pushSync = async () => {
  const token = await getSetting(SETTING_TOKEN, '');
  if (!token) throw new Error('No sync token configured.');
  const pulled = await pullSync();
  const events = await getAllEventsForSync();
  const res = await pushSyncFile({ token, events });
  return { ...res, pulled };
};
