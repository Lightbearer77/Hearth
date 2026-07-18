// ─── Day-view timeline layout + event search ───
// Pure functions, fully covered by the test suite.

// Column assignment for concurrent timed events (the classic calendar
// side-by-side layout). Input: [{ id, startMin, endMin, ... }].
// Output: same items (copies) with { col, cols } added — `col` is the
// event's column index, `cols` the width divisor shared by its whole
// overlap cluster, so every member of a cluster renders at equal width.
// Rules:
//   · Events sharing any moment overlap; touching (end === next start)
//     does NOT overlap.
//   · A cluster is a maximal group chained by overlap; column indices are
//     assigned greedily (lowest free column), and `cols` = the cluster's
//     peak concurrency footprint.
export const layoutDayEvents = (items) => {
  const sorted = [...items].sort(
    (a, b) => a.startMin - b.startMin || b.endMin - a.endMin
  );
  const out = [];
  let cluster = [];
  let colEnds = [];

  const closeCluster = () => {
    const cols = colEnds.length || 1;
    for (const ev of cluster) ev.cols = cols;
    cluster = [];
    colEnds = [];
  };

  for (const it of sorted) {
    const activeMax = colEnds.length ? Math.max(...colEnds) : -1;
    if (cluster.length && it.startMin >= activeMax) closeCluster();
    let col = colEnds.findIndex(end => end <= it.startMin);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(it.endMin);
    } else {
      colEnds[col] = it.endMin;
    }
    const placed = { ...it, col, cols: 1 };
    cluster.push(placed);
    out.push(placed);
  }
  closeCluster();
  return out;
};

// Case-insensitive search over title / description / location.
// Empty or whitespace-only queries return nothing; results sort by date.
export const searchEvents = (events, query) => {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  return events
    .filter(e =>
      [e.title, e.description, e.location].some(v => (v || '').toLowerCase().includes(q))
    )
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
};

// Order a day's event entries for the month grid (see MonthView):
//   1. Spanning (multi-day) events first — continuous bars take top slots.
//   2. All-day before timed within each group.
//   3. Timed events chronologically by start time, not creation order.
//   4. Deterministic title tiebreak.
const startMinutesOf = (evt) => {
  const t = evt && evt.startTime;
  if (!t || !/^\d{2}:\d{2}$/.test(t)) return -1;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export const sortDayEntries = (entries) =>
  entries.slice().sort((a, b) => {
    const aSingle = a.isStart && a.isEnd ? 1 : 0;
    const bSingle = b.isStart && b.isEnd ? 1 : 0;
    if (aSingle !== bSingle) return aSingle - bSingle;
    const am = startMinutesOf(a.event);
    const bm = startMinutesOf(b.event);
    if (am !== bm) return am - bm;
    return (a.event.title || '').localeCompare(b.event.title || '');
  });
