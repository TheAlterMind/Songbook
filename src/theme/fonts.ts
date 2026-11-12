import { Platform } from 'react-native';

// Sitness's font choices. There is no network font loading: these are the fonts that ship with the device
// (Android's named families) with common desktop equivalents so the browser shows something close.
// How a font looks therefore depends a little on the device.
export const FONT_CHOICES: { label: string; value: string; native?: string; web?: string }[] = [
  { label: 'System default', value: 'system' },
  { label: 'Roboto', value: 'roboto', native: 'sans-serif', web: "Roboto, 'Segoe UI', Arial, sans-serif" },
  { label: 'Light', value: 'light', native: 'sans-serif-light', web: "'Segoe UI Light', 'Helvetica Neue', Roboto, sans-serif" },
  { label: 'Medium', value: 'medium', native: 'sans-serif-medium', web: "'Segoe UI Semibold', Roboto, sans-serif" },
  { label: 'Condensed', value: 'condensed', native: 'sans-serif-condensed', web: "'Arial Narrow', Roboto, sans-serif" },
  { label: 'Serif', value: 'serif', native: 'serif', web: "serif, Georgia, 'Times New Roman'" },
  { label: 'Monospace', value: 'mono', native: 'monospace', web: "monospace, Consolas, 'Courier New'" },
  { label: 'Serif monospace', value: 'serif-mono', native: 'serif-monospace', web: "'Courier New', monospace" },
  { label: 'Casual', value: 'casual', native: 'casual', web: "'Comic Sans MS', 'Segoe Print', sans-serif" },
  { label: 'Cursive', value: 'cursive', native: 'cursive', web: "'Segoe Script', 'Brush Script MT', sans-serif" },
];

/** The fontFamily to apply for a choice, or undefined for the device's own default. iOS has no named families here. */
export function fontFamily(value: string): string | undefined {
  const c = FONT_CHOICES.find((f) => f.value === value);
  if (!c || c.value === 'system') return undefined;
  if (Platform.OS === 'web') return c.web;
  return Platform.OS === 'android' ? c.native : undefined;
}
