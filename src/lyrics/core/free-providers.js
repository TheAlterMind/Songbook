import { encodeUtf8Base64Url, decodeUtf8Base64Url } from './encoding.js';
import { load } from 'cheerio/slim';
import { LyricsError } from './http.js';
import { createYoutubeMusicProvider } from './youtube-music.js';
import { deezerMetadata, sanitizeMetadata } from './metadata.js';

export const freeProviderConfig = [
  { id: 'lyricsovh', name: 'Lyrics.ovh', enabled: true, lyricsMode: 'inline' },
  { id: 'synclrc', name: 'SyncLRC', enabled: true, lyricsMode: 'inline' },
  { id: 'betterlyrics', name: 'Better Lyrics', enabled: true, lyricsMode: 'inline' },
  { id: 'youtubemusic', name: 'YouTube Music (Google)', enabled: true, lyricsMode: 'inline' },
];
const clean = value => typeof value === 'string' && value.trim() ? value.replace(/\r\n?/g, '\n').trim() : null;
const invalid = () => new LyricsError('INVALID_RESPONSE', 'The provider returned an unexpected response.');
const unavailable = provider => new LyricsError('LYRICS_UNAVAILABLE', `${provider} has no free lyrics for this recording. Try another version or provider.`, 404);
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value;
}
function metadataText(value, required = true) {
  const text = clean(value);
  if ((required && !text) || (text && text.length > 300)) throw invalid();
  return text;
}
const durationValue = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 86400 ? value : null;

// These public selection IDs carry bounded metadata, never credentials. Version
// two also preserves optional Deezer art/media facts across app restarts. URLs
// are display metadata only and are never used as a lyric fetch destination.
// SyncLRC IDs also carry the query and version details because its canonical IDs
// are shared by different recordings. There is no process-local selection cache.
function encodeSelection(provider, sourceId, song, query = null) {
  const extra = { ...sanitizeMetadata(song.metadata) };
  delete extra.album;
  delete extra.duration;
  const values = [1, provider, sourceId, song.title, song.artist, song.album, song.duration, query];
  if (provider === 'lyricsovh' && Object.keys(extra).length) {
    const enriched = 'v2.' + encodeUtf8Base64Url(JSON.stringify([2, ...values.slice(1), extra]));
    if (enriched.length <= 8192) return enriched;
  }
  return 'v1.' + encodeUtf8Base64Url(JSON.stringify(values));
}
function decodeSelection(id, provider) {
  try {
    if (typeof id !== 'string' || id.length > 8192 || !/^v[12]\.[A-Za-z0-9_-]+$/.test(id)) throw new Error();
    const values = JSON.parse(decodeUtf8Base64Url(id.slice(3)));
    if (!Array.isArray(values)) throw new Error();
    const [version, origin, sourceId, title, artist, album, duration, query, extra] = values;
    if (!((version === 1 && values.length === 8) || (version === 2 && values.length === 9 && provider === 'lyricsovh')) ||
        !id.startsWith(`v${version}.`) || origin !== provider || typeof sourceId !== 'string' ||
        !(provider === 'synclrc' ? /^[a-f0-9]{32}$/ : /^[1-9]\d{0,14}$/).test(sourceId) ||
        metadataText(title) !== title || metadataText(artist) !== artist ||
        !(album === null || (typeof album === 'string' && metadataText(album, false) === album)) ||
        !(duration === null || durationValue(duration) === duration) ||
        !(provider === 'synclrc' ? typeof query === 'string' && query.trim() === query && query.length > 0 && query.length <= 200 : query === null)) throw new Error();
    const song = { title, artist, album, duration, metadata: sanitizeMetadata({ ...extra, album, duration }) };
    if (encodeSelection(provider, sourceId, song, query) !== id) throw new Error();
    return { sourceId, ...song, query };
  } catch {
    throw new LyricsError('INVALID_ID', 'Select a valid song from search results.', 400);
  }
}
const ovhUrl = song => `https://api.lyrics.ovh/v1/${encodeURIComponent(song.artist)}/${encodeURIComponent(song.title)}`;
function ovhSong(value) {
  const data = object(value);
  const sourceId = String(data.id ?? '');
  if (!/^[1-9]\d{0,14}$/.test(sourceId)) throw invalid();
  const song = {
    provider: 'lyricsovh', title: metadataText(data.title), artist: metadataText(data.artist?.name),
    album: metadataText(data.album?.title, false), duration: durationValue(data.duration),
    instrumental: null, hasLyrics: null,
    metadata: deezerMetadata(data),
  };
  return { ...song, id: encodeSelection('lyricsovh', sourceId, song), url: ovhUrl(song) };
}
function syncSong(value, query) {
  const data = object(value);
  if (typeof data.id !== 'string' || !/^[a-f0-9]{32}$/.test(data.id)) throw invalid();
  const lyrics = object(data.lyrics);
  const song = {
    provider: 'synclrc', title: metadataText(data.track), artist: metadataText(data.artist),
    album: metadataText(data.album, false), duration: durationValue(data.duration),
    instrumental: data.instrumental === true,
    hasLyrics: Boolean(clean(lyrics.plain) || clean(lyrics.synced) || clean(lyrics.karaoke)),
    metadata: sanitizeMetadata({ album: data.album, duration: data.duration }),
  };
  const params = new URLSearchParams({ q: query, limit: '10' });
  return { ...song, id: encodeSelection('synclrc', data.id, song, query), url: `https://api.synclrc.dev/search?${params}` };
}

function seconds(value) {
  if (typeof value !== 'string' || !/^(?:\d+:){0,2}\d+(?:\.\d+)?s?$/.test(value)) return null;
  const parts = value.replace(/s$/, '').split(':').map(Number);
  if (parts.length > 1 && parts.slice(1).some(part => part >= 60)) return null;
  const total = parts.reduce((sum, part) => sum * 60 + part, 0);
  return Number.isFinite(total) && total >= 0 && total <= 86400 ? total : null;
}
function timestamp(value) {
  const centiseconds = Math.round(value * 100);
  return `[${String(Math.floor(centiseconds / 6000)).padStart(2, '0')}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, '0')}.${String(centiseconds % 100).padStart(2, '0')}]`;
}
export function parseTtml(ttml) {
  if (typeof ttml !== 'string' || !ttml.trim() || /<!DOCTYPE|<!ENTITY/i.test(ttml)) throw invalid();
  const $ = load(ttml, { xmlMode: true });
  const tag = element => element.name?.split(':').pop();
  if (!$('*').toArray().some(element => tag(element) === 'tt')) throw invalid();
  const lines = [];
  for (const element of $('*').toArray()) {
    if (tag(element) !== 'p' || !$(element).parents().toArray().some(parent => tag(parent) === 'body')) continue;
    const node = $(element).clone();
    node.find('*').filter((_, child) => tag(child) === 'br').replaceWith('\n');
    node.find('*').filter((_, child) => ['metadata', 'script', 'style'].includes(tag(child))).remove();
    const text = clean(node.text().split('\n').map(line => line.replace(/[\t ]+/g, ' ').trim()).join('\n'));
    if (!text) continue;
    lines.push({ text, begin: seconds($(element).attr('begin')) });
  }
  if (!lines.length) throw invalid();
  const timed = lines.every(line => line.begin !== null);
  return {
    plainLyrics: lines.map(line => line.text).join('\n'),
    syncedLyrics: timed ? lines.flatMap(line => line.text.split('\n').map(text => timestamp(line.begin) + text)).join('\n') : null,
  };
}

export function createFreeProviders({ http, searchCatalog, getCatalogSong, plainFromLrc }) {
  const youtubeMusic = createYoutubeMusicProvider({ http });
  async function syncSearch(query) {
    const params = new URLSearchParams({ q: query, limit: '10' });
    const data = object(await http.request(`https://api.synclrc.dev/search?${params}`));
    if (!Array.isArray(data.results)) throw invalid();
    const unique = new Map();
    for (const value of data.results) {
      const song = syncSong(value, query);
      const lyrics = {
        plainLyrics: clean(value.lyrics.plain),
        syncedLyrics: clean(value.lyrics.synced) || clean(value.lyrics.karaoke),
      };
      lyrics.plainLyrics ||= lyrics.syncedLyrics ? plainFromLrc(lyrics.syncedLyrics) : null;
      const existing = unique.get(song.id);
      if (existing && JSON.stringify(existing.lyrics) !== JSON.stringify(lyrics)) throw invalid();
      unique.set(song.id, { song, lyrics });
    }
    return [...unique.values()];
  }
  function betterSong(song) {
    return { ...song, provider: 'betterlyrics', hasLyrics: null, url: 'https://better-lyrics.boidu.dev/' };
  }
  return {
    has: provider => freeProviderConfig.some(item => item.id === provider),
    async search(provider, query, options = {}) {
      if (provider === 'youtubemusic') return youtubeMusic.search(query, options);
      if (provider === 'lyricsovh') {
        const data = object(await http.request(`https://api.lyrics.ovh/suggest/${encodeURIComponent(query)}`));
        if (!Array.isArray(data.data)) throw invalid();
        return { results: data.data.map(ovhSong) };
      }
      if (provider === 'synclrc') return { results: (await syncSearch(query)).map(item => item.song) };
      return { results: (await searchCatalog(query)).map(betterSong) };
    },
    async getLyrics(provider, id) {
      if (provider === 'youtubemusic') return youtubeMusic.getLyrics(id);
      if (provider === 'lyricsovh') {
        const metadata = decodeSelection(id, provider);
        const song = { id, provider, title: metadata.title, artist: metadata.artist, album: metadata.album,
          duration: metadata.duration, url: ovhUrl(metadata), instrumental: null, hasLyrics: true,
          metadata: metadata.metadata };
        let data;
        try { data = object(await http.request(song.url)); }
        catch (error) { if (error.code === 'NOT_FOUND') throw unavailable('Lyrics.ovh'); throw error; }
        const plainLyrics = clean(data.lyrics);
        if (!plainLyrics) throw unavailable('Lyrics.ovh');
        return { song, plainLyrics, syncedLyrics: null };
      }
      if (provider === 'synclrc') {
        const selection = decodeSelection(id, provider);
        const match = (await syncSearch(selection.query)).find(item => item.song.id === id);
        if (!match) throw new LyricsError('NOT_FOUND', 'This exact recording is no longer in the results. Search again to select a version.', 404);
        if (!match.lyrics.plainLyrics && !match.song.instrumental) throw unavailable('SyncLRC');
        return { song: match.song, ...match.lyrics };
      }
      const song = betterSong(await getCatalogSong(id));
      if (!song.album || song.duration === null) throw unavailable('Better Lyrics');
      const params = new URLSearchParams({ s: song.title, a: song.artist, al: song.album, d: String(Math.round(song.duration)) });
      let data;
      try { data = object(await http.request(`https://api.betterlyrics.org/getLyrics?${params}`)); }
      catch (error) {
        if (['ACCESS_DENIED', 'NOT_FOUND'].includes(error.code)) {
          throw new LyricsError('LYRICS_UNAVAILABLE', 'Better Lyrics has no free cached lyrics for this recording. Try another version or provider.', 404);
        }
        throw error;
      }
      return { song: { ...song, hasLyrics: true }, ...parseTtml(data.ttml) };
    },
  };
}
