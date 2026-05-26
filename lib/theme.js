// ─── Theme constants for The Hearth (native) ───
// Same palette as the web app v0.3.

export const COLORS = {
  bgDeep:     '#16120e',
  bgSurface:  '#1e1910',
  bgElevated: '#262014',
  bgHover:    '#2e271a',

  textPrimary:   '#ede4d4',
  textSecondary: '#c4b49a',
  textMuted:     '#8a7a62',
  textFaint:     '#50463a',

  borderSubtle: '#2e271a',
  borderMid:    '#3e3628',
  borderStrong: '#504638',

  accent:    '#c9a84c',
  accentDim: '#8a7234',

  g1: '#c9a84c',
  g2: '#5b8a72',
  g3: '#8b4a4a',
  g4: '#4a6a8b',
};

// ─── Fonts ───
// Loaded via expo-font in App.js. Falls back to platform serif until loaded.
// Spectral for body, Cormorant Garamond for display.
export const FONTS = {
  display: 'CormorantGaramond',
  body:    'Spectral',
  mono:    'monospace',
};

// Fallback fonts before custom load completes
export const FONTS_FALLBACK = {
  display: 'serif',
  body:    'serif',
  mono:    'monospace',
};

export const PRESET_COLORS = [
  '#c9a84c', '#8b4a4a', '#4a6a8b', '#5b8a72',
  '#a8704c', '#7a6a8a', '#4a8a8a', '#8a7a4a',
  '#8a4a6a', '#6a4a8a', '#8a8a4a', '#4a4a8a',
];

export const DEFAULT_CATEGORIES = [
  { id: 'G1',       name: 'Autonomous Man',      color: '#c9a84c' },
  { id: 'G2',       name: 'Longhouse Tribe',     color: '#5b8a72' },
  { id: 'G3',       name: 'Physical Foundation', color: '#8b4a4a' },
  { id: 'G4',       name: 'Legacy Work',         color: '#4a6a8b' },
  { id: 'RITUAL',   name: 'Ritual',              color: '#a8704c' },
  { id: 'PERSONAL', name: 'Personal',            color: '#7a6a8a' },
];
