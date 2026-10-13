import { load } from 'cheerio/slim';
import { LyricsError } from './http.js';
import { sanitizeMetadata, httpsUrl } from './metadata.js';

const origin = 'https://tabs.ultimate-guitar.com';
const invalid = () => new LyricsError('INVALID_RESPONSE', 'Ultimate Guitar returned an unsupported or invalid chord sheet.');
const unavailable = () => new LyricsError('LYRICS_UNAVAILABLE', 'Ultimate Guitar has no public lyrics with chords for this song.', 404);
const text = (value, max = 300) => typeof value === 'string' && value.trim() && value.length <= max &&
  !/[\u0000-\u001f\u007f]/u.test(value) ? value.trim() : null;

function chartPath(value, selection = false) {
  try {
    if (typeof value !== 'string' || value.length > 1500) throw new Error();
    const url = new URL(value, origin);
    if (url.origin !== origin || url.username || url.password || url.search || url.hash) throw new Error();
    const match = /^\/tab\/[a-z0-9_%'-]+\/[a-z0-9_%'-]+-chords-([1-9]\d{0,14})$/i.exec(url.pathname);
    if (!match || /%2f|%5c|%00/i.test(url.pathname) || (selection && value !== url.pathname)) throw new Error();
    return { path: url.pathname, tabId: match[1] };
  } catch {
    if (selection) throw new LyricsError('INVALID_ID', 'Select a valid Ultimate Guitar song from search results.', 400);
    return null;
  }
}
function pageData(html) {
  try {
    const $ = load(html);
    const raw = $('.js-store[data-content]');
    if (raw.length !== 1) throw new Error();
    const data = JSON.parse(raw.attr('data-content')).store?.page?.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return { $, data };
  } catch { throw invalid(); }
}
function songRecord(tab, path) {
  const title = text(tab?.song_name), artist = text(tab?.artist_name);
  if (!title || !artist) throw invalid();
  return { id: path, provider: 'ultimateguitar', title, artist, album: null, duration: null,
    url: origin + path, instrumental: null, hasLyrics: null };
}

export function parseUltimateGuitarSearch(html) {
  const { data } = pageData(html);
  if (!Array.isArray(data.results)) throw invalid();
  const results = [], seen = new Set();
  for (const tab of data.results.slice(0, 200)) {
    // Marketing/Official/Pro results can point at paid or unrelated destinations.
    if (tab?.type !== 'Chords' || tab.tab_access_type !== 'public' || tab.marketing_type) continue;
    const parsed = chartPath(tab.tab_url);
    if (!parsed || parsed.tabId !== String(tab.id) || seen.has(parsed.path)) continue;
    try {
      const song = songRecord(tab, parsed.path);
      song.metadata = metadataFor(tab, {}, song);
      results.push(song); seen.add(parsed.path);
    } catch { /* Ignore individual incomplete search hits. */ }
  }
  return { results };
}

const section = value => /^\[(?:intro|verse|chorus|pre[- ]chorus|post[- ]chorus|bridge|outro|refrain|hook|solo|interlude|instrumental|coda)\b[^\]]{0,100}\]$/iu.test(value.trim());
const instruction = value => /^(?:intro|outro|solo|interlude|instrumental|repeat|play|strum(?:ming)?|capo|tuning|key|chords?|end(?:ing)?|fade out)\b/iu.test(value.trim());
const asciiTab = value => /^\s*(?:[A-Geb]?\|)?[-|x\d~hpbr/\\]{4,}/iu.test(value);
const chord = value => value.length <= 60 && /^(?:[A-G](?:#|b|♯|♭){0,2}(?:(?:maj|min|dim|aug|sus|add|omit|no|M|m|Δ|ø|°)|\d{1,2}|[#b♯♭+−-]\d{0,2}|\/(?:9|11|13)|\([A-Za-z0-9#b♯♭,+−-]{1,20}\))*(?:\/[A-G](?:#|b|♯|♭){0,2})?|N\.?C\.?)$/u.test(value);
function expandTabs(value, start) {
  let out = '';
  for (const character of value) out += character === '\t' ? ' '.repeat(8 - ((start + out.length) % 8)) : character;
  return out;
}
function chordRow(raw) {
  const source = raw.replace(/\[\/?tab\]/gi, '');
  let cursor = 0, displayed = '', residual = '', inline = '';
  const positions = [], inlinePositions = [];
  for (const match of source.matchAll(/\[ch\]([^\[\]\r\n]+)\[\/ch\]/gi)) {
    const before = source.slice(cursor, match.index);
    const padding = expandTabs(before, displayed.length);
    displayed += padding; residual += padding;
    inline += expandTabs(before, inline.length);
    const symbol = match[1].trim();
    if (!chord(symbol)) throw invalid();
    positions.push({ offset: displayed.length, symbol });
    inlinePositions.push({ offset: inline.length, symbol });
    displayed += match[1]; residual += ' '.repeat(match[1].length);
    cursor = match.index + match[0].length;
  }
  const tail = source.slice(cursor);
  displayed += expandTabs(tail, displayed.length);
  residual += expandTabs(tail, residual.length);
  inline += expandTabs(tail, inline.length);
  if (/\[\/?(?:ch|tab)\b/i.test(inline) || /[\u0000-\u0008\u000b-\u001f\u007f]/u.test(inline)) throw invalid();
  return { text: displayed.trimEnd(), residual: residual.trimEnd(), inline: inline.trimEnd(), positions, inlinePositions,
    opensTab: /\[tab\]/i.test(raw), closesTab: /\[\/tab\]/i.test(raw) };
}
const hasWords = value => /\p{L}{2}/u.test(value) && !section(value) && !instruction(value) && !asciiTab(value);
function anchoredLine(value, chords) {
  const maximum = chords.at(-1)?.offset || 0;
  const padded = value.padEnd(Math.max(value.length, maximum), ' ');
  return { text: padded, chords: chords.map(anchor => {
    // A source display column must never split a UTF-16 surrogate pair.
    const offset = anchor.offset > 0 && /[\uD800-\uDBFF]/u.test(padded[anchor.offset - 1]) &&
      /[\uDC00-\uDFFF]/u.test(padded[anchor.offset] || '') ? anchor.offset + 1 : anchor.offset;
    return { offset, symbol: anchor.symbol };
  }) };
}

export function parseUltimateGuitarText(content) {
  if (typeof content !== 'string' || !content.trim() || content.length > 200000) throw invalid();
  const rows = content.replace(/\r\n?/g, '\n').split('\n').map(chordRow);
  const firstChord = rows.findIndex(row => row.positions.length);
  if (firstChord < 0) throw unavailable();
  // Free-form contributor introductions are not lyrics. The chart begins at
  // its first section (when present) or its first tagged chord, not at a guessed
  // lyric position; all subsequent sections and instrumental rows are retained.
  const firstSection = rows.findIndex((row, i) => i <= firstChord && section(row.text) && !/^\[coda\]/i.test(row.text));
  const start = firstSection >= 0 ? firstSection : firstChord;
  const lines = [];
  let lyricRows = 0, lyricCharacters = 0, chordCount = 0;
  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    if (row.text.length > 20000 || row.positions.length > 300) throw invalid();
    if (!row.positions.length) {
      lines.push({ text: row.text });
      continue;
    }
    chordCount += row.positions.length;
    const next = rows[i + 1];
    if (hasWords(row.residual)) {
      lines.push(anchoredLine(row.inline, row.inlinePositions));
      lyricRows++; lyricCharacters += row.inline.trim().length;
    } else if (!row.residual.trim() && next && !next.positions.length &&
        (hasWords(next.text) || row.opensTab && next.closesTab && /\p{L}{2}/u.test(next.text) && !section(next.text) && !asciiTab(next.text))) {
      lines.push(anchoredLine(next.text, row.positions));
      lyricRows++; lyricCharacters += next.text.trim().length; i++;
    } else {
      // Intros, turnarounds and repeated chord-only bars keep their spacing.
      lines.push(anchoredLine(row.residual, row.positions));
    }
  }
  while (lines.length && !lines.at(-1).text.trim() && !lines.at(-1).chords?.length) lines.pop();
  if (chordCount > 10000 || lines.length > 5000) throw invalid();
  if (lyricRows < 2 || lyricCharacters < 30) throw unavailable();
  return { lines, plainLyrics: lines.map(line => line.text).join('\n').trim(), syncedLyrics: null };
}

function preambleMetadata(content) {
  if (typeof content !== 'string') return {};
  const facts = {}, conflicts = new Set();
  const add = (field, value) => {
    if (conflicts.has(field)) return;
    if (facts[field] !== undefined && JSON.stringify(facts[field]) !== JSON.stringify(value)) {
      delete facts[field]; conflicts.add(field);
    } else facts[field] = value;
  };
  // Directives before the arrangement are useful source facts. Do not interpret
  // similar words inside lyrics or playing instructions as recording metadata.
  for (const raw of content.slice(0, 20000).replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (/\[ch\]/i.test(line) || section(line)) break;
    let match;
    if ((match = /^capo\s*(?::|=|-)?\s*(?:on\s+(?:the\s+)?)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+fret)?[.!]?$/i.exec(line))) {
      const capo = Number(match[1]); if (capo <= 24) add('capo', capo);
    } else if (/^(?:capo\s*[:=-]\s*(?:none|no capo)|no capo)[.!]?$/i.test(line)) add('capo', 0);
    else if ((match = /^(?:song\s+)?key\s*[:=-]\s*([A-G][#b♯♭]?(?:m|maj|min| major| minor)?)[.]?$/i.exec(line))) add('key', match[1][0].toUpperCase() + match[1].slice(1));
    else if ((match = /^(?:guitar\s+)?tuning\s*[:=-]\s*(.+)$/i.exec(line))) {
      const value = match[1].match(/\(([^()]*)\)\s*$/)?.[1] || match[1];
      const tuning = value.trim().split(/[\s,-]+/);
      if (tuning.length >= 4 && tuning.length <= 12 && tuning.every(note => /^[A-G][#b♯♭]?[0-9]?$/.test(note))) add('tuning', tuning);
    } else if ((match = /^(?:tempo\s*[:=-]\s*(\d{1,3}(?:\.\d+)?)\s*(?:bpm)?|bpm\s*[:=-]\s*(\d{1,3}(?:\.\d+)?))$/i.exec(line))) {
      const tempo = Number(match[1] || match[2]); if (tempo >= 1 && tempo <= 500) add('tempo', tempo);
    } else if ((match = /^time\s+signature\s*[:=-]\s*([1-9]\d?\/(?:1|2|4|8|16|32|64))$/i.exec(line))) add('timeSignature', match[1]);
  }
  return facts;
}

function metadataFor(tab, view, song) {
  const meta = view.meta || {};
  const tuning = typeof meta.tuning?.value === 'string' ? meta.tuning.value.trim().split(/\s+/) : undefined;
  const covers = tab.album_cover?.web_album_cover;
  const mediaLinks = [{ kind: 'sheet', label: 'Ultimate Guitar chord sheet', url: song.url }];
  for (const url of Array.isArray(tab.recording?.video_urls) ? tab.recording.video_urls : []) {
    if (httpsUrl(url)) mediaLinks.push({ kind: 'video', label: 'Recording video', url });
  }
  const credits = text(tab.username) ? [{ role: 'Transcriber', name: tab.username }] : [];
  const recording = [tab.recording?.is_acoustic === 1 ? 'Acoustic' : '', text(tab.recording?.performance)].filter(Boolean).join(' · ');
  const structured = sanitizeMetadata({ key: meta.tonality || tab.tonality_name,
    capo: typeof meta.capo === 'number' ? meta.capo : undefined, tuning,
    difficulty: view.ug_difficulty || meta.difficulty || tab.difficulty,
    artworkUrl: httpsUrl(covers?.large) || httpsUrl(covers?.medium) || httpsUrl(covers?.small),
    genre: view.song_genre, recording, mediaLinks, credits,
  });
  return sanitizeMetadata({ ...preambleMetadata(view.wiki_tab?.content), ...structured });
}

export function parseUltimateGuitarPage(html, requestedId) {
  const selected = chartPath(requestedId, true);
  const { $, data } = pageData(html);
  const tab = data.tab, view = data.tab_view;
  if (!tab || String(tab.id) !== selected.tabId || !view) throw invalid();
  const actual = chartPath(tab.tab_url);
  const canonical = $('link[rel="canonical"]').attr('href');
  if (!actual || actual.tabId !== selected.tabId || (canonical && chartPath(canonical)?.tabId !== selected.tabId)) throw invalid();
  if (tab.type !== 'Chords' || tab.tab_access_type !== 'public' || view.blocked === true) throw unavailable();
  const song = songRecord(tab, selected.path);
  const arrangement = parseUltimateGuitarText(view.wiki_tab?.content);
  const metadata = metadataFor(tab, view, song);
  return { song: { ...song, hasLyrics: true, metadata }, ...arrangement,
    attribution: { name: 'Ultimate Guitar', text: 'Lyrics and chord arrangement from Ultimate Guitar', url: song.url },
  };
}

export function createUltimateGuitarProvider({ http }) {
  return {
    async search(query, { signal } = {}) {
      const cleaned = text(query, 200);
      if (!cleaned) throw new LyricsError('INVALID_QUERY', 'Enter a song title and/or artist (up to 200 characters).', 400);
      const params = new URLSearchParams({ search_type: 'title', value: cleaned });
      const html = await http.request(`https://www.ultimate-guitar.com/search.php?${params}`, { json: false, signal });
      return parseUltimateGuitarSearch(html);
    },
    async getLyrics(id, { signal } = {}) {
      const selected = chartPath(id, true);
      return parseUltimateGuitarPage(await http.request(origin + selected.path, { json: false, signal }), selected.path);
    },
  };
}
