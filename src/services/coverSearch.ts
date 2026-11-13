import { Platform } from 'react-native';

// Manual cover search for the cover picker: several candidates for a free-text query, not one best guess.
// Deezer on a phone (the browser can't call it), MusicBrainz plus the Cover Art Archive otherwise or as a top-up.
const CLIENT = 'Songbook/1.0 (personal lyrics app)';
const headers: Record<string, string> = Platform.OS === 'web' ? {} : { 'User-Agent': CLIENT };

export type CoverChoice = { url: string; label: string };

async function getJson(url: string, ms = 8000): Promise<any> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { headers, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Covers matching a free-text search (for example "Sting Fragile"). Empty when none were found. */
export async function searchCovers(query: string): Promise<CoverChoice[]> {
  const q = query.trim();
  if (!q) return [];
  const found: CoverChoice[] = [];
  const seen = new Set<string>();
  const add = (url: string, label: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    found.push({ url, label });
  };

  if (Platform.OS !== 'web') {
    try {
      const data = await getJson(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=40`);
      for (const t of data?.data || []) {
        add(t.album?.cover_big || t.album?.cover_medium, [t.album?.title, t.artist?.name].filter(Boolean).join(' · '));
      }
    } catch {
      // fall through to MusicBrainz
    }
  }

  if (found.length < 4) {
    try {
      const data = await getJson(`https://musicbrainz.org/ws/2/release?query=${encodeURIComponent(q)}&fmt=json&limit=12`);
      for (const rel of data?.releases || []) {
        if (found.length >= 12) break;
        const url = `https://coverartarchive.org/release/${rel.id}/front-500`;
        if (seen.has(url)) continue;
        try {
          const res = await fetch(url, { method: 'HEAD' });
          if (res.ok) add(url, [rel.title, rel['artist-credit']?.[0]?.name].filter(Boolean).join(' · '));
        } catch {
          // no cover for this release
        }
      }
    } catch {
      // keep what Deezer found
    }
  }
  return found.slice(0, 24);
}
