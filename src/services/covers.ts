import { Platform } from 'react-native';
import { Song, setSongCover } from '../db/Database';

// Album covers. Deezer's search API is keyless and returns the cover with each track; MusicBrainz plus the
// Cover Art Archive (also keyless) is the fallback. Only the song title, artist and album are sent, as the
// search text. Browsers can't set User-Agent, and Deezer doesn't allow browser (CORS) requests (its only
// browser route, JSONP, would run Deezer's script inside the page that holds the library), so on web
// MusicBrainz does all the work.
const CLIENT = 'Songbook/1.0 (personal lyrics app)';
const headers: Record<string, string> = Platform.OS === 'web' ? {} : { 'User-Agent': CLIENT };

/** Lower case, no accents, brackets or "- remastered" tails, only letters and digits: for comparing names. */
function norm(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\s+-\s+.*$/, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

/** How many single-letter edits (insert, delete, change) turn a into b. */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

// Names count as the same when one contains the other, or when they differ by a typo: one letter for names of
// 5+ letters, two for 12+ (so "Breaking' In" still finds "Breakin' In"). Short names must match exactly.
const same = (a: string, b: string) => {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const shortest = Math.min(x.length, y.length);
  const allowed = shortest >= 12 ? 2 : shortest >= 5 ? 1 : 0;
  return allowed > 0 && editDistance(x, y) <= allowed;
};

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

async function deezer(title: string, artist: string): Promise<string> {
  for (const q of [`artist:"${artist}" track:"${title}"`, `${artist} ${title}`]) {
    const data = await getJson(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=10`);
    const hit = (data?.data || []).find(
      (t: any) => same(t.title, title) && same(t.artist?.name, artist) && (t.album?.cover_big || t.album?.cover_medium)
    );
    if (hit) return hit.album.cover_big || hit.album.cover_medium;
  }
  return '';
}

// MusicBrainz asks for at most one request a second.
let lastMusicBrainz = 0;
async function politely() {
  const wait = lastMusicBrainz + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastMusicBrainz = Date.now();
}

async function musicBrainz(title: string, artist: string): Promise<string> {
  await politely();
  const q = `recording:"${title}" AND artist:"${artist}"`;
  const data = await getJson(`https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(q)}&fmt=json&limit=5`);
  const ids: string[] = [];
  for (const rec of data?.recordings || []) {
    if (!same(rec.title, title)) continue;
    if (!(rec['artist-credit'] || []).some((c: any) => same(c.name || c.artist?.name, artist))) continue;
    for (const rel of rec.releases || []) if (!ids.includes(rel.id)) ids.push(rel.id);
  }
  for (const id of ids.slice(0, 4)) {
    const url = `https://coverartarchive.org/release/${id}/front-500`;
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) return url;
    } catch {
      // try the next release
    }
  }
  return '';
}

/** A cover URL for the song, '' when none exists, or null when the lookup couldn't be done (try again later). */
export async function findCover(title: string, artist: string): Promise<string | null> {
  if (!title.trim() || !artist.trim()) return '';
  let failed = false;
  const sources = Platform.OS === 'web' ? [musicBrainz] : [deezer, musicBrainz];
  for (const source of sources) {
    try {
      const url = await source(title, artist);
      if (url) return url;
    } catch {
      failed = true;
    }
  }
  return failed ? null : '';
}

let running = false;

/**
 * Looks up covers for songs that haven't been tried yet, one at a time, saving each as it is found.
 * Songs whose lookup failed (offline, rate limited) stay untried and are picked up on a later visit.
 */
export async function backfillCovers(songs: Song[], onCover: (id: number, cover: string) => void): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (const s of songs) {
      if (s.cover !== null && s.cover !== undefined) continue;
      const cover = await findCover(s.title, s.artist);
      if (cover === null) continue;
      await setSongCover(s.id as number, cover);
      onCover(s.id as number, cover);
    }
  } finally {
    running = false;
  }
}
