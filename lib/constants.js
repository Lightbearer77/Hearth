// ─── Greek Calendar Constants & Logic ───
// Ported from The Hearth web. Same logic, no UI dependencies.

export const GREEK_MONTHS = [
  { id: "M01", name: "Alpha",   letter: "Α", start: "01-01", end: "01-28" },
  { id: "M02", name: "Beta",    letter: "Β", start: "01-29", end: "02-25" },
  { id: "M03", name: "Gamma",   letter: "Γ", start: "02-26", end: "03-25" },
  { id: "M04", name: "Delta",   letter: "Δ", start: "03-26", end: "04-22" },
  { id: "M05", name: "Epsilon", letter: "Ε", start: "04-23", end: "05-20" },
  { id: "M06", name: "Zeta",    letter: "Ζ", start: "05-21", end: "06-17" },
  { id: "M07", name: "Eta",     letter: "Η", start: "06-18", end: "07-15" },
  { id: "M08", name: "Theta",   letter: "Θ", start: "07-16", end: "08-12" },
  { id: "M09", name: "Iota",    letter: "Ι", start: "08-13", end: "09-09" },
  { id: "M10", name: "Kappa",   letter: "Κ", start: "09-10", end: "10-07" },
  { id: "M11", name: "Lambda",  letter: "Λ", start: "10-08", end: "11-04" },
  { id: "M12", name: "Mu",      letter: "Μ", start: "11-05", end: "12-02" },
  { id: "M13", name: "Nu",      letter: "Ν", start: "12-03", end: "12-30" },
];

export const SEASONAL_THEMES = {
  M01: { theme: "Hearth",        meaning: "Deepest dark · endurance",    color: "#4a5468" },
  M02: { theme: "Stirring",      meaning: "First return of light",       color: "#5a6878" },
  M03: { theme: "Thaw",          meaning: "Ground softens",              color: "#6a6258" },
  M04: { theme: "Sowing",        meaning: "First ground worked",         color: "#8a7848" },
  M05: { theme: "Greening",      meaning: "Life surges",                 color: "#6a8a48" },
  M06: { theme: "Rising",        meaning: "Momentum builds",             color: "#5a8848" },
  M07: { theme: "Sun's Peak",    meaning: "Full power",                  color: "#c9a84c" },
  M08: { theme: "First Fruit",   meaning: "Early harvest",               color: "#b89148" },
  M09: { theme: "Reaping",       meaning: "Main grain harvest",          color: "#b87848" },
  M10: { theme: "Gathering",     meaning: "Bringing in",                 color: "#a85838" },
  M11: { theme: "Winter Nights", meaning: "Ancestors · threshold",       color: "#8a3838" },
  M12: { theme: "Descent",       meaning: "Inward turn",                 color: "#58385a" },
  M13: { theme: "Yule",          meaning: "Sacred dark · reflection",    color: "#3848a8" },
  PLANNING: { theme: "Threshold", meaning: "Year-turn · ✦ Planning",     color: "#c9a84c" },
};

// ─── Day-of-year math (handles leap years cleanly) ───
const dayOfYear = (date) => {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date - start;
  return Math.floor(diff / 86400000) + 1;
};

export const gregToGreek = (input) => {
  if (!input) return null;
  const date = typeof input === "string" ? new Date(input + "T12:00:00") : input;
  if (isNaN(date.getTime())) return null;
  const doy = dayOfYear(date);
  const year = date.getFullYear();
  if (doy > 364) {
    return {
      isPlanningDay: true,
      planningDayNumber: doy - 364,
      year,
      monthId: "PLANNING",
      letter: "✦",
      monthName: "Planning Day",
      day: doy - 364,
    };
  }
  const monthIndex = Math.floor((doy - 1) / 28);
  const day = ((doy - 1) % 28) + 1;
  const m = GREEK_MONTHS[monthIndex];
  return {
    monthId: m.id,
    letter: m.letter,
    monthName: m.name,
    day,
    isPlanningDay: false,
    year,
  };
};

export const greekToGreg = (greek) => {
  if (!greek) return null;
  if (greek.isPlanningDay || greek.monthId === "PLANNING") {
    const y = greek.year || new Date().getFullYear();
    const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const n = greek.planningDayNumber || greek.day || 1;
    const dec = isLeap ? (n === 1 ? 30 : 31) : 31;
    return `${y}-12-${String(dec).padStart(2, "0")}`;
  }
  const monthIndex = GREEK_MONTHS.findIndex(m => m.id === greek.monthId);
  if (monthIndex < 0) return null;
  const day = Math.min(28, Math.max(1, greek.day || 1));
  const doy = monthIndex * 28 + day;
  const y = greek.year || new Date().getFullYear();
  const date = new Date(y, 0, doy);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export const fmtGreek = (dateStr) => {
  const g = gregToGreek(dateStr);
  if (!g) return "";
  if (g.isPlanningDay) return "✦";
  return `${g.letter}${g.day}`;
};

export const fmtGreekLong = (dateStr) => {
  const g = gregToGreek(dateStr);
  if (!g) return "";
  if (g.isPlanningDay) return `Planning Day ${g.planningDayNumber || 1}`;
  return `${g.monthName} ${g.day}`;
};

export const fmtGreg = (isoDate) => isoDate
  ? new Date(isoDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
  : "";

export const fmtGregLong = (isoDate) => isoDate
  ? new Date(isoDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
  : "";

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const greekMonthRange = (monthId, year) => {
  if (monthId === "PLANNING") {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return {
      start: `${year}-12-${isLeap ? "30" : "31"}`,
      end: `${year}-12-31`,
    };
  }
  return {
    start: greekToGreg({ monthId, day: 1, year }),
    end: greekToGreg({ monthId, day: 28, year }),
  };
};

export const greekMonthDays = (monthId, year) => {
  if (monthId === "PLANNING") {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const days = [`${year}-12-31`];
    if (isLeap) days.unshift(`${year}-12-30`);
    return days;
  }
  const days = [];
  for (let d = 1; d <= 28; d++) {
    days.push(greekToGreg({ monthId, day: d, year }));
  }
  return days;
};

export const nextGreekMonth = (monthId, year) => {
  if (monthId === "PLANNING") return { monthId: "M01", year: year + 1 };
  if (monthId === "M13") return { monthId: "PLANNING", year };
  const idx = GREEK_MONTHS.findIndex(m => m.id === monthId);
  return { monthId: GREEK_MONTHS[idx + 1].id, year };
};

export const prevGreekMonth = (monthId, year) => {
  if (monthId === "PLANNING") return { monthId: "M13", year };
  if (monthId === "M01") return { monthId: "PLANNING", year: year - 1 };
  const idx = GREEK_MONTHS.findIndex(m => m.id === monthId);
  return { monthId: GREEK_MONTHS[idx - 1].id, year };
};

export const dayOfWeek = (isoDate) => {
  const d = new Date(isoDate + "T12:00:00");
  return d.getDay();
};
