#!/usr/bin/env node
// Claude-side publish discipline for hearth-sync.json. Merges your changes
// into the CURRENT published file with the repo's tested LWW engine and
// emits the full merged snapshot on stdout.
//
// The sync file lives in the PRIVATE repo Lightbearer77/hearth-sync, so this
// reads it from a LOCAL CLONE (no network, no CDN staleness):
//
//   git -C <clone> fetch --depth=1 origin main && git -C <clone> reset --hard origin/main
//   node tools/claude-publish.mjs my-changes.json <clone>/hearth-sync.json > merged.json
//   cp merged.json <clone>/hearth-sync.json   # then commit and push
//
//   my-changes.json = { "events": [ { id, title, date, ..., updatedAt: <ms> } ] }
//   tombstone       = { "id": ..., "updatedAt": <ms>, "deleted": true }
//
// Always fetch/reset the clone first: the phone may have pushed since you
// last looked. Then check the added / removed / changed id lists before
// committing.

import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stage = mkdtempSync(join(tmpdir(), 'hearth-publish-'));
writeFileSync(join(stage, 'sync.mjs'), readFileSync(join(root, 'lib', 'sync.js'), 'utf8'));
const { mergeSyncFile, SYNC_FILE_VERSION } =
  await import(pathToFileURL(join(stage, 'sync.mjs')).href);

const [changesPath, currentPath] = process.argv.slice(2);
if (!changesPath || !currentPath) {
  console.error('Usage: claude-publish.mjs <changes.json> <path-to-current-hearth-sync.json>');
  process.exit(1);
}
const changes = JSON.parse(readFileSync(changesPath, 'utf8'));
const current = existsSync(currentPath)
  ? JSON.parse(readFileSync(currentPath, 'utf8'))
  : { events: [] };

// Direction: published file = "local", your changes = "incoming".
// The published file may hold records normalizeEvent would reject; keep them
// verbatim by treating the current list as already-normalized local state.
const local = (current.events || []).map(e => ({ ...e, updatedAt: e.updatedAt || 0 }));
const merged = mergeSyncFile(local, { events: changes.events || [] });

const r = merged.report;
console.error(`Events: ${r.inserted} new · ${r.updated} updated · ${r.deletedApplied} removed · ${r.localWon} kept · ${r.skipped} skipped`);
if (r.skipped) console.error('WARNING: some of your records were invalid and skipped (need id, title, ISO date).');

console.log(JSON.stringify({
  version: SYNC_FILE_VERSION,
  lastUpdated: new Date().toISOString(),
  updatedBy: 'Claude',
  events: merged.merged,
}, null, 2));
