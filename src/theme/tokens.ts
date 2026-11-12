// Palette borrowed from the Sitness app: a violet-first accent set, a near-black dark theme
// tinted with the accent, flat grey surfaces and one 16px corner radius everywhere.

export const ACCENT_OPTIONS = [
  { label: 'Violet', value: '#8E71E6' },
  { label: 'Teal', value: '#2FB6A0' },
  { label: 'Amber', value: '#D89C46' },
  { label: 'Coral', value: '#EA6A50' },
];

/** Mixes a neutral grey level with 5% of the accent, optionally darkened by a factor. */
function tint(level: number, accentHex: string, share = 0.05, factor = 1): string {
  const n = parseInt(accentHex.slice(1), 16);
  const mix = (c: number) =>
    Math.min(255, Math.round((level * (1 - share) + c * share) * factor))
      .toString(16)
      .padStart(2, '0');
  return '#' + mix((n >> 16) & 255) + mix((n >> 8) & 255) + mix(n & 255);
}

export type Colors = {
  bg: string;
  surface: string; // cards, list rows, sheets
  menuBg: string; // bottom tab bar
  well: string; // tags, tonal buttons: a step below the cards
  text: string;
  divider: string; // borders, tracks
  neutral500: string; // secondary text
  neutral700: string; // off switch track
  neutral800: string; // tag background
  accent100: string; // text and icons drawn on the accent
  accent800: string;
  accent: string;
};

export function darkColors(accent: string): Colors {
  const control = tint(0x33, accent, 0.05, 0.5832); // Sitness "control grey"
  const track = tint(0x38, accent);
  const well = tint(0x13, accent);
  return {
    bg: tint(0x00, accent, 0.1), // 90% black + 10% accent
    surface: control,
    menuBg: control,
    well,
    text: tint(0xee, accent),
    divider: track,
    neutral500: tint(0x99, accent),
    neutral700: track,
    neutral800: well,
    accent100: '#0B0814',
    accent800: tint(0x00, accent, 0.35),
    accent,
  };
}

export function lightColors(accent: string): Colors {
  return {
    bg: '#F4F6F7',
    surface: '#FFFFFF',
    menuBg: '#FFFFFF',
    well: '#E8EEF0',
    text: '#111A1F',
    divider: '#DEE6E9',
    neutral500: '#5F6E79',
    neutral700: '#C9D3D7',
    neutral800: '#E8EEF0',
    accent100: '#0B0814',
    accent800: '#E9E3FB',
    accent,
  };
}

export const RADIUS = { sm: 16, md: 16, lg: 16 };
