import { load } from 'cheerio/slim';
import { LyricsError } from './http.js';
import { sanitizeMetadata } from './metadata.js';

const origin = 'https://www.songsterr.com';
const invalid = () => new LyricsError('INVALID_RESPONSE', 'Songsterr returned an unsupported or invalid chord sheet.');
const unavailable = () => new LyricsError('LYRICS_UNAVAILABLE', 'Songsterr has no lyrics with chords for this song.', 404);
const clean = (value, limit = 300) => typeof value === 'string' && value.trim() && value.length <= limit && !/[\u0000-\u001f\u007f]/u.test(value) ? value.trim() : null;
const numericId = value => /^[1-9]\d{0,14}$/.test(String(value)) ? String(value) : null;

// Carry the observed route in the selection. Made-up slugs redirect, and the
// shared transport deliberately refuses redirects and never bypasses denial.
function chartPath(value, selection = false) {
  try {
    if (typeof value !== 'string' || value.length > 1500) throw new Error();
    const url = new URL(value, origin);
    if (url.origin !== origin || url.username || url.password || url.search || url.hash) throw new Error();
    const path = url.pathname.replace(/-tab-s(?=\d+$)/, '-chords-s');
    const match = /^\/a\/wsa\/[a-z0-9_%'-]+-chords-s([1-9]\d{0,14})$/i.exec(path);
    if (!match || /%2f|%5c|%00/i.test(path)) throw new Error();
    if (selection && path !== value) throw new Error();
    return { path, songId: match[1] };
  } catch {
    if (selection) throw new LyricsError('INVALID_ID', 'Select a valid Songsterr song from search results.', 400);
    return null;
  }
}
function pageState($) {
  try {
    const text = $('script#state[type="application/json"]').text();
    const state = JSON.parse(text);
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error();
    return state;
  } catch { throw invalid(); }
}
function songRecord(data, path) {
  const title = clean(data?.title), artist = clean(data?.artist);
  if (!title || !artist) throw invalid();
  return { id: path, provider: 'songsterr', title, artist, album: null, duration: null,
    url: origin + path, instrumental: null, hasLyrics: null };
}

export function parseSongsterrSearch(html) {
  const $ = load(html), state = pageState($);
  const entries = state.songs?.songs?.list;
  if (!Array.isArray(entries)) throw invalid();
  const paths = new Map();
  $('a[href]').each((_, element) => {
    const parsed = chartPath($(element).attr('href'));
    if (parsed) paths.set(parsed.songId, parsed.path);
  });
  const results = [], seen = new Set();
  for (const entry of entries.slice(0, 200)) {
    const id = numericId(entry?.songId), path = paths.get(id);
    if (!id || !path || entry.hasChords !== true || entry.isJunk === true || seen.has(id)) continue;
    try { results.push(songRecord(entry, path)); seen.add(id); } catch { /* Ignore malformed individual results. */ }
  }
  return { results };
}

const note = value => typeof value === 'string' && /^[A-G](?:#|b|♯|♭){0,2}$/u.test(value) ? value : null;
function chordSymbol(value) {
  const root = note(value?.baseNote?.name), bass = note(value?.firstNote?.name);
  const suffix = value?.chordType?.suffix;
  if (!root || !bass || typeof suffix !== 'string' || !/^[A-Za-z0-9#b♯♭()+−°øΔ-]{0,40}$/u.test(suffix)) throw invalid();
  return root + suffix + (root !== bass ? '/' + bass : '');
}
function parseLine(pieces) {
  if (!Array.isArray(pieces) || pieces.length > 1000) throw invalid();
  let text = '', lyricText = '';
  const chords = [];
  for (let i = 0; i < pieces.length; i += 1) {
    const piece = pieces[i];
    if (piece?.type === 'chord') {
      let symbol = chordSymbol(piece.chord);
      // Some imported charts split an unfamiliar slash chord into two chord
      // tokens around a slash. Keep it as one symbol at the original anchor.
      if (pieces[i + 1]?.type === 'noise' && pieces[i + 1].text === '/' && pieces[i + 2]?.type === 'chord') {
        const bass = chordSymbol(pieces[i + 2].chord);
        if (note(bass) && !symbol.includes('/')) { symbol += '/' + bass; i += 2; }
      }
      // Songsterr also leaves alterations such as Am6-9 in an adjacent noise
      // token. Consume only the musical suffix, preserving repeat directions.
      const next = pieces[i + 1];
      if (next?.type === 'noise' && typeof next.text === 'string') {
        const suffix = /^(?:[-+](?:5|9|11|13)|\((?:add|no|sus)?[b#]?\d{1,2}\))(?=\s|$)/.exec(next.text);
        if (suffix) {
          symbol += suffix[0];
          pieces = pieces.slice();
          pieces[i + 1] = { ...next, text: next.text.slice(suffix[0].length) };
        }
      }
      chords.push({ offset: text.length, symbol });
    } else if (piece?.type === 'text' || piece?.type === 'noise') {
      if (typeof piece.text !== 'string' || piece.text.length > 20000 || /[\u0000-\u0008\u000b-\u001f\u007f]/u.test(piece.text) || /[\r\n]/.test(piece.text)) throw invalid();
      const value = piece.text.replace(/\t/g, '    ').replace(/\u00a0/g, ' ');
      text += value;
      if (piece.type === 'text') lyricText += value;
    } else throw invalid();
  }
  if (text.length > 20000 || chords.length > 300) throw invalid();
  return { line: { text, ...(chords.length ? { chords } : {}) }, lyricText };
}
function tuning(value) {
  const raw = clean(value, 120);
  if (!raw) return null;
  const notes = raw.match(/\(([^()]*)\)/)?.[1] || raw;
  const parts = notes.match(/[A-G](?:#|b|♯|♭)?[0-8]?/gu);
  return parts?.length >= 4 && parts.length <= 12 && notes.replace(/[A-G](?:#|b|♯|♭)?[0-8]?/gu, '').replace(/[\s,-]/g, '') === '' ? parts : null;
}
function metadataFor(state, rows, song) {
  const metadata = { mediaLinks: [{ kind: 'sheet', label: 'Songsterr chord sheet', url: song.url }] };
  for (const row of rows) {
    const value = clean(row?.text, 300);
    if (!value) continue;
    if (row.type === 'tuning') metadata.tuning = tuning(value);
    else if (row.type === 'album') metadata.album = value;
    else if (row.type === 'capo' && /^(?:[0-9]|1[0-9]|2[0-4])$/.test(value)) metadata.capo = Number(value);
    else if (row.type === 'key' && /^[A-G][#b♯♭]?(?:m| major| minor)?$/u.test(value)) metadata.key = value;
    else if (row.type === 'tempo' && /^\d{2,3}(?:\.\d+)?(?:\s*bpm)?$/i.test(value)) {
      const tempo = Number.parseFloat(value); if (tempo >= 20 && tempo <= 400) metadata.tempo = tempo;
    } else if ((row.type === 'time' || row.type === 'timeSignature') && /^\d{1,2}\/\d{1,2}$/.test(value)) metadata.timeSignature = value;
  }
  // Tab instrument settings and tab-author credits describe a separate
  // arrangement. Only song-level media links can accompany the chord sheet.
  const meta = state.meta?.current;
  if (numericId(meta?.songId) === numericId(state.chords?.current?.songId)) {
    const seen = new Set();
    for (const video of (Array.isArray(meta.videos) ? meta.videos : []).slice(0, 50)) {
      if (video?.status !== 'done' || !/^[A-Za-z0-9_-]{11}$/.test(video.videoId) || seen.has(video.videoId)) continue;
      seen.add(video.videoId);
      metadata.mediaLinks.push({ kind: 'video', label: clean(video.feature, 50) ? `YouTube (${video.feature})` : 'YouTube', url: `https://www.youtube.com/watch?v=${video.videoId}` });
      if (metadata.mediaLinks.length >= 12) break;
    }
  }
  return sanitizeMetadata(metadata);
}

export function parseSongsterrPage(html, requestedId) {
  const selected = chartPath(requestedId, true);
  const $ = load(html), state = pageState($), current = state.chords?.current;
  if (!current || numericId(current.songId) !== selected.songId) throw invalid();
  const canonical = $('link[rel="canonical"]').attr('href');
  if (canonical && chartPath(canonical)?.songId !== selected.songId) throw invalid();
  const rows = state.chordpro?.current;
  if (!Array.isArray(rows) || !rows.length) throw unavailable();
  if (rows.length > 5000) throw invalid();
  const song = songRecord(current, selected.path), lines = [];
  let lyricCharacters = 0, lyricRows = 0, anchorCount = 0, totalLength = 0;
  for (const row of rows) {
    if (row?.type === 'line') {
      const parsed = parseLine(row.line);
      lines.push(parsed.line); totalLength += parsed.line.text.length;
      anchorCount += parsed.line.chords?.length || 0;
      if (/\p{L}/u.test(parsed.lyricText)) { lyricRows += 1; lyricCharacters += parsed.lyricText.trim().length; }
    } else if (row?.type === 'section' || row?.type === 'comment') {
      const label = clean(row.text, 300);
      if (label) { lines.push({ text: `[${label}]` }); totalLength += label.length + 2; }
    } else if (!['tuning', 'capo', 'key', 'tempo', 'time', 'timeSignature', 'title', 'artist', 'album', 'subtitle'].includes(row?.type)) {
      // Unknown content must not silently truncate an arrangement.
      throw invalid();
    }
    if (totalLength > 200000 || anchorCount > 10000) throw invalid();
  }
  if (!anchorCount || lyricRows < 2 || lyricCharacters < 30) throw unavailable();
  const metadata = metadataFor(state, rows, song);
  return {
    song: { ...song, album: metadata?.album || null, hasLyrics: true, metadata }, lines,
    plainLyrics: lines.map(line => line.text).join('\n').trim(), syncedLyrics: null,
    attribution: { name: 'Songsterr', text: 'Lyrics and chord arrangement from Songsterr', url: song.url },
  };
}

export function createSongsterrProvider({ http }) {
  return {
    async search(query, { signal } = {}) {
      const text = clean(query, 200);
      if (!text) throw new LyricsError('INVALID_QUERY', 'Enter a song title and/or artist (up to 200 characters).', 400);
      const html = await http.request(`${origin}/?${new URLSearchParams({ pattern: text })}`, { json: false, signal });
      return parseSongsterrSearch(html);
    },
    async getLyrics(id, { signal } = {}) {
      const selected = chartPath(id, true);
      const html = await http.request(origin + selected.path, { json: false, signal });
      return parseSongsterrPage(html, selected.path);
    },
  };
}
