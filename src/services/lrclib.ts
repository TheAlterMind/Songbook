import { Platform } from 'react-native';

// LRCLIB (https://lrclib.net) is an open, community-run lyrics database with a free, keyless,
// CORS-enabled API. Its docs ask clients to identify themselves; browsers may not set User-Agent,
// so web uses the Lrclib-Client header the docs offer instead. No personal details are sent.
const BASE = 'https://lrclib.net/api';
const CLIENT = 'Songbook/1.0 (personal lyrics app)';

export type LrclibRecord = {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string | null;
  duration: number | null; // seconds
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
};

const headers: Record<string, string> =
  Platform.OS === 'web' ? { 'Lrclib-Client': CLIENT } : { 'User-Agent': CLIENT };

/** Plain lyrics for a record, falling back to the synced ones with their timestamps removed. */
export function lyricsOf(r: LrclibRecord): string {
  if (r.plainLyrics?.trim()) return r.plainLyrics.trim();
  if (r.syncedLyrics?.trim()) {
    return r.syncedLyrics
      .split('\n')
      .map((l) => l.replace(/^\s*(\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\])+\s?/, ''))
      .join('\n')
      .trim();
  }
  return '';
}

/**
 * Searches every field (title, artist, album) for the query. Results without lyrics are dropped,
 * and exact duplicates (same title, artist and lyrics, which LRCLIB often has) collapse into one.
 */
export async function searchLyrics(query: string, signal?: AbortSignal): Promise<LrclibRecord[]> {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(query.trim())}`, { headers, signal });
  if (res.status === 429) throw new Error('LRCLIB is busy right now. Wait a minute and try again.');
  if (!res.ok) throw new Error(`LRCLIB search failed (${res.status}).`);
  const records: LrclibRecord[] = await res.json();

  const seen = new Set<string>();
  return records.filter((r) => {
    const lyrics = lyricsOf(r);
    if (!lyrics && !r.instrumental) return false;
    const key = `${r.trackName}|${r.artistName}|${lyrics}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
