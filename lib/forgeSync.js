// ─── Read-only Forge picks ───
// Hearth never writes to forge-sync.json. A Forge "Push State" overwrites
// GitHub with the phone's raw snapshot, so a Hearth-side write would be lost
// on the next push. Hearth only reads the public file and shows the tasks the
// user has moved to In Progress during weekly planning.

import { getKv, setKv } from './storage';
import { forgePicksFromSync, syncPushedAt } from './tasks';

const SYNC_URL =
  'https://raw.githubusercontent.com/Lightbearer77/Forge/main/forge-sync.json';
const CACHE_KEY = 'forgePicks';
const TIMEOUT_MS = 10000;

const EMPTY = { picks: [], pushedAt: 0, fetchedAt: 0 };

// Last good result, so the day sheet still works offline.
export const loadCachedPicks = async () => {
  try {
    const raw = await getKv(CACHE_KEY);
    if (!raw) return EMPTY;
    const v = JSON.parse(raw);
    return {
      picks: Array.isArray(v.picks) ? v.picks : [],
      pushedAt: Number(v.pushedAt) || 0,
      fetchedAt: Number(v.fetchedAt) || 0,
    };
  } catch {
    return EMPTY;
  }
};

// Fetch the live file. Throws on any network / parse failure so the caller can
// keep showing the cache; on success the cache is refreshed.
export const fetchForgePicks = async () => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // The query string defeats the raw-content CDN's ~5 minute cache.
    const res = await fetch(`${SYNC_URL}?cb=${Date.now()}`, {
      signal: ctrl.signal,
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const sync = await res.json();
    const result = {
      picks: forgePicksFromSync(sync),
      pushedAt: syncPushedAt(sync),
      fetchedAt: Date.now(),
    };
    try { await setKv(CACHE_KEY, JSON.stringify(result)); } catch { /* cache is best-effort */ }
    return result;
  } finally {
    clearTimeout(timer);
  }
};
