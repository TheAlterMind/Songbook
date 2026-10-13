import { load } from 'cheerio/slim';
import { HttpClient, LyricsError } from './http.js';
import { createFreeProviders, freeProviderConfig } from './free-providers.js';
import { createProviderLookup } from './provider-lookup.js';

const clean = value => typeof value === 'string' && value.trim() ? value.replace(/\r\n?/g, '\n').trim() : null;

function record(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LyricsError('INVALID_RESPONSE', 'The provider returned an unexpected response.');
  }
  return value;
}

function idString(value, upstream = false) {
  const id = String(value ?? '');
  if (!/^\d{1,15}$/.test(id) || Number(id) < 1) {
    if (upstream) throw new LyricsError('INVALID_RESPONSE', 'The provider returned an invalid song ID.');
    throw new LyricsError('INVALID_ID', 'Select a valid song from search results.', 400);
  }
  return id;
}

function sourceUrl(value, allowedHosts) {
  let url;
  try { url = new URL(value); } catch { /* handled below */ }
  if (!url || url.protocol !== 'https:' || !allowedHosts.includes(url.hostname) ||
      url.username || url.password || url.port) {
    throw new LyricsError('INVALID_RESPONSE', 'The provider returned an unexpected source URL.');
  }
  return url.href;
}

function lrclibSong(data) {
  record(data);
  const id = idString(data.id, true);
  const title = clean(data.trackName);
  const artist = clean(data.artistName);
  if (!title || !artist) throw new LyricsError('INVALID_RESPONSE', 'The provider response is missing song metadata.');
  return {
    id, provider: 'lrclib', title, artist, album: clean(data.albumName),
    duration: typeof data.duration === 'number' && Number.isFinite(data.duration) ? data.duration : null,
    url: `https://lrclib.net/api/get/${id}`, instrumental: data.instrumental === true,
    hasLyrics: Boolean(clean(data.plainLyrics) || clean(data.syncedLyrics)),
  };
}

function geniusSong(data) {
  record(data);
  const title = clean(data.title);
  const artist = clean(data.primary_artist?.name);
  if (!title || !artist) throw new LyricsError('INVALID_RESPONSE', 'The provider response is missing song metadata.');
  return {
    id: idString(data.id, true), provider: 'genius', title, artist,
    album: clean(data.album?.name), duration: null,
    url: sourceUrl(data.url, ['genius.com', 'www.genius.com']),
    instrumental: null, hasLyrics: null,
  };
}

export function plainFromLrc(lrc) {
  return clean(lrc.split('\n')
    .filter(line => !/^\s*\[(?:ar|al|ti|au|by|offset|re|ve|length):/i.test(line))
    .map(line => line.replace(/\[\d+:\d{2}(?:[.:]\d+)?\]/g, '')
      .replace(/<\d+:\d{2}(?:[.:]\d+)?>/g, '').trim())
    .join('\n'));
}

// Genius lyric text is in its HTML, not its API response. Only parse the
// recognized lyric containers; never mistake an error/challenge page for lyrics.
export function extractGeniusLyrics(html) {
  const $ = load(html);
  const selector = '[data-lyrics-container="true"]';
  let containers = $(selector);
  if (!containers.length) containers = $('.lyrics');
  const parts = containers.toArray().filter(element => !$(element).parents(selector).length).map(element => {
    const node = $(element).clone();
    node.find('script, style, noscript, iframe, svg, button, form, h1, h2, [hidden], [aria-hidden="true"], [data-exclude-from-selection="true"]').remove();
    node.find('br').replaceWith('\n');
    node.find('p, div').append('\n');
    return clean(node.text().replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n')
      .split('\n').map(line => line.trim()).join('\n').replace(/\n{3,}/g, '\n\n'));
  }).filter(Boolean);
  const lyrics = clean(parts.join('\n\n'));
  if (!lyrics) throw new LyricsError('EXTRACTION_FAILED', 'Genius returned no recognizable lyrics. The page may be blocked, unavailable, or use a changed layout.', 502);
  return lyrics;
}

export function createLyricsService({ http = new HttpClient(), geniusToken = '' } = {}) {
  const token = geniusToken.trim();
  const free = createFreeProviders({
    http, plainFromLrc,
    async searchCatalog(query) {
      const data = await http.request(`https://lrclib.net/api/search?${new URLSearchParams({ q: query })}`);
      if (!Array.isArray(data)) throw new LyricsError('INVALID_RESPONSE', 'LRCLIB returned an unexpected search response.');
      return data.map(lrclibSong);
    },
    async getCatalogSong(id) {
      const safeId = idString(id);
      const song = lrclibSong(await http.request(`https://lrclib.net/api/get/${safeId}`));
      if (song.id !== safeId) throw new LyricsError('INVALID_RESPONSE', 'The provider returned a different song.');
      return song;
    },
  });
  function providerCheck(provider) {
    if (!['lrclib', 'genius'].includes(provider) && !free.has(provider)) throw new LyricsError('INVALID_PROVIDER', 'Choose an available lyrics provider.', 400);
    if (provider === 'genius' && !token) throw new LyricsError('NOT_CONFIGURED', 'Genius access is not configured for this build.', 503);
  }
  const genius = path => http.request(`https://api.genius.com${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const service = {
    config() {
      return { providers: [
        { id: 'lrclib', name: 'LRCLIB', enabled: true, lyricsMode: 'inline' },
        { id: 'genius', name: 'Genius', enabled: Boolean(token), lyricsMode: 'inline' },
        ...freeProviderConfig.map(provider => ({ ...provider })),
      ] };
    },
    async search(query, provider = 'lrclib', options = {}) {
      providerCheck(provider);
      const q = typeof query === 'string' ? query.trim() : '';
      if (!q || q.length > 200) throw new LyricsError('INVALID_QUERY', 'Enter a song title and/or artist (up to 200 characters).', 400);
      const params = new URLSearchParams({ q });
      if (free.has(provider)) return free.search(provider, q, options);
      if (provider === 'lrclib') {
        const data = await http.request(`https://lrclib.net/api/search?${params}`);
        if (!Array.isArray(data)) throw new LyricsError('INVALID_RESPONSE', 'LRCLIB returned an unexpected search response.');
        return { results: data.map(lrclibSong) };
      }
      const data = await genius(`/search?${params}`);
      const hits = record(data).response?.hits;
      if (!Array.isArray(hits)) throw new LyricsError('INVALID_RESPONSE', 'Genius returned an unexpected search response.');
      return { results: hits.map(record).filter(hit => hit.type === 'song').map(hit => geniusSong(hit.result)) };
    },
    async getLyrics(provider, id) {
      providerCheck(provider);
      if (free.has(provider)) return free.getLyrics(provider, id);
      const safeId = idString(id);
      if (provider === 'lrclib') {
        const data = record(await http.request(`https://lrclib.net/api/get/${safeId}`));
        const song = lrclibSong(data);
        if (song.id !== safeId) throw new LyricsError('INVALID_RESPONSE', 'The provider returned a different song.');
        const syncedLyrics = clean(data.syncedLyrics);
        const plainLyrics = clean(data.plainLyrics) || (syncedLyrics ? plainFromLrc(syncedLyrics) : null);
        if (!plainLyrics && !song.instrumental) throw new LyricsError('LYRICS_UNAVAILABLE', 'This record has no lyrics yet. Try another version or provider.', 404);
        return { song, plainLyrics, syncedLyrics };
      }
      const data = record(await genius(`/songs/${safeId}`));
      const song = geniusSong(data.response?.song);
      if (song.id !== safeId) throw new LyricsError('INVALID_RESPONSE', 'The provider returned a different song.');
      // Fetch the selected source page without the API token. The transport
      // refuses redirects and stops on access denial rather than bypassing it.
      const html = await http.request(song.url, { json: false });
      const plainLyrics = extractGeniusLyrics(html);
      return {
        song: { ...song, hasLyrics: true }, plainLyrics, syncedLyrics: null, lyricsStatus: 'available',
      };
    },
  };
  const lookup = createProviderLookup({ search: (...args) => service.search(...args), getLyrics: (...args) => service.getLyrics(...args) });
  service.findLyrics = async (selection, provider) => {
    providerCheck(provider);
    return lookup(selection, provider);
  };
  return service;
}
