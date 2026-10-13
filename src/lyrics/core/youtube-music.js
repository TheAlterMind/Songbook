import { LyricsError } from './http.js';

const DOMAIN = 'https://music.youtube.com';
const PROVIDER = 'youtubemusic';
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LYRICS_ID = /^MPLY[A-Za-z0-9_-]{1,200}$/;
const SONGS_FILTER = 'EgWKAQIIAWoMEA4QChADEAQQCRAF';
// One bootstrap + one search + at most two requests per recording stays below
// the Workers free-plan limit of 50 subrequests for a search request.
const SEARCH_LIMIT = 20;
const invalid = message => new LyricsError('INVALID_RESPONSE', message || 'YouTube Music returned an unexpected response.');
const unavailable = () => new LyricsError('LYRICS_UNAVAILABLE', 'YouTube Music has no lyrics for this recording. Try another version or provider.', 404);

function text(value, max = 300) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\r\n?/g, '\n').trim();
  if (!cleaned) return null;
  if (cleaned.length > max) throw invalid();
  return cleaned;
}

function runs(value, max = 300) {
  if (typeof value?.simpleText === 'string') return text(value.simpleText, max);
  if (!Array.isArray(value?.runs)) return null;
  if (value.runs.some(run => typeof run?.text !== 'string')) throw invalid();
  return text(value.runs.map(run => run.text).join(''), max);
}

const browseType = endpoint => endpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
const artistEndpoint = endpoint => browseType(endpoint) === 'MUSIC_PAGE_TYPE_ARTIST' ||
  (!browseType(endpoint) && typeof endpoint?.browseId === 'string' && endpoint.browseId.startsWith('UC'));
function byline(value) {
  const artists = [];
  const albums = [];
  if (value?.runs !== undefined && !Array.isArray(value.runs)) throw invalid();
  for (const run of value?.runs || []) {
    const endpoint = run.navigationEndpoint?.browseEndpoint;
    const label = text(run.text);
    if (label && artistEndpoint(endpoint)) artists.push(label);
    if (label && browseType(endpoint) === 'MUSIC_PAGE_TYPE_ALBUM') albums.push(label);
  }
  const uniqueAlbums = [...new Set(albums)];
  if (uniqueAlbums.length > 1) throw invalid();
  // Artists without a channel page still appear as ordinary text before the
  // first byline separator. Keep that group (including collaboration punctuation)
  // rather than requiring every displayed artist to have a navigation link.
  const separator = value?.runs?.findIndex(run => run.text?.trim() === '\u2022') ?? -1;
  const firstGroup = separator > 0 ? value.runs.slice(0, separator) : [];
  const artistGroup = firstGroup.length && firstGroup.every(run => !run.navigationEndpoint || artistEndpoint(run.navigationEndpoint.browseEndpoint))
    ? runs({ runs: firstGroup }) : null;
  return { artist: artistGroup || text([...new Set(artists)].join(', ')), album: uniqueAlbums[0] || null };
}

function duration(value) {
  if (typeof value !== 'string' || !/^(?:\d{1,2}:)?\d{1,3}:\d{2}$/.test(value.trim())) return null;
  const parts = value.trim().split(':').map(Number);
  if (parts.slice(1).some(part => part >= 60)) return null;
  const total = parts.reduce((sum, part) => sum * 60 + part, 0);
  return total <= 86400 ? total : null;
}

function song(id, title, artist, album, seconds, hasLyrics = null) {
  if (typeof id !== 'string' || !VIDEO_ID.test(id) || !title || !artist) throw invalid('YouTube Music returned incomplete song metadata.');
  return { id, provider: PROVIDER, title, artist, album, duration: seconds,
    url: `${DOMAIN}/watch?v=${id}`, instrumental: null, hasLyrics };
}

function searchSongs(data) {
  const contents = data?.contents;
  const root = contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content || contents;
  const sections = root?.sectionListRenderer?.contents;
  if (!Array.isArray(sections)) throw invalid();
  const found = new Map();
  for (const section of sections) {
    const items = section.musicShelfRenderer?.contents || section.itemSectionRenderer?.contents;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const row = item.musicResponsiveListItemRenderer;
      if (!row) continue;
      const columns = row.flexColumns?.map(column => column.musicResponsiveListItemFlexColumnRenderer?.text);
      if (!Array.isArray(columns) || columns.length < 2) throw invalid();
      const watch = columns[0]?.runs?.find(run => run.navigationEndpoint?.watchEndpoint)?.navigationEndpoint.watchEndpoint;
      const id = row.playlistItemData?.videoId || watch?.videoId;
      if (watch?.videoId && watch.videoId !== id) throw invalid('YouTube Music returned conflicting song IDs.');
      const videoType = watch?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType;
      if (videoType && videoType !== 'MUSIC_VIDEO_TYPE_ATV') continue;
      if (row.musicItemRendererDisplayPolicy === 'MUSIC_ITEM_RENDERER_DISPLAY_POLICY_GREY_OUT') continue;
      const meta = byline(columns[1]);
      const seconds = columns[1]?.runs?.map(run => duration(run.text)).find(value => value !== null) ?? null;
      const result = song(id, runs(columns[0]), meta.artist, meta.album, seconds);
      if (!found.has(id)) found.set(id, result);
    }
  }
  return [...found.values()].slice(0, SEARCH_LIMIT);
}

function selectedSong(data, id) {
  const tabs = data?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs;
  if (!Array.isArray(tabs)) throw invalid();
  const queue = tabs[0]?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer?.contents;
  if (!Array.isArray(queue)) throw invalid();
  const selected = queue.map(item => item.playlistPanelVideoRenderer || item.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer)
    .filter(item => item?.selected === true);
  if (selected.length !== 1 || selected[0].videoId !== id) {
    throw invalid('YouTube Music returned a different recording. Search again to select a version.');
  }
  const row = selected[0];
  const meta = byline(row.longBylineText);
  const result = song(id, runs(row.title), meta.artist || runs(row.shortBylineText), meta.album, duration(runs(row.lengthText)));
  const lyricsTabs = tabs.filter(tab => tab.tabRenderer?.unselectable !== true)
    .map(tab => tab.tabRenderer?.endpoint?.browseEndpoint)
    .filter(endpoint => browseType(endpoint) === 'MUSIC_PAGE_TYPE_TRACK_LYRICS');
  if (!lyricsTabs.length) throw unavailable();
  if (lyricsTabs.length !== 1 || !LYRICS_ID.test(lyricsTabs[0].browseId || '')) throw invalid();
  return { song: result, browseId: lyricsTabs[0].browseId };
}

function lyricText(data) {
  const sections = data?.contents?.sectionListRenderer?.contents;
  if (!Array.isArray(sections)) throw unavailable();
  const shelves = sections.map(section => section.musicDescriptionShelfRenderer).filter(Boolean);
  if (shelves.length > 1) throw invalid('YouTube Music returned ambiguous lyric sections.');
  if (!shelves.length) throw unavailable();
  const plainLyrics = runs(shelves[0].description, 200000);
  if (!plainLyrics) throw unavailable();
  if (plainLyrics.split('\n').filter(line => line.trim()).every(line =>
    /^(?:instrumental|\[instrumental\]|\(instrumental\)|no lyrics available)$/i.test(line.trim()))) throw unavailable();
  // The current response places attribution in footer; older responses use runs.
  const sourceAttribution = runs(shelves[0].footer, 1000) || runs(shelves[0], 1000);
  const attribution = sourceAttribution ? { name: sourceAttribution.replace(/^Source:\s*/i, ''), text: sourceAttribution } : null;
  return { plainLyrics, syncedLyrics: null, attribution };
}

// Public web-client requests documented by ytmusicapi (an unofficial client).
// SOCS is its optional-cookie preference, not an account/session credential.
// Only server-provided public visitor data is used; no user cookies or API key.
export function createYoutubeMusicProvider({ http }) {
  let bootstrap;
  let bootstrapExpires = 0;
  async function configuration() {
    if (!bootstrap || Date.now() >= bootstrapExpires) {
      bootstrapExpires = Date.now() + 60 * 60 * 1000;
      bootstrap = (async () => {
        const html = await http.request(DOMAIN + '/', { json: false, headers: { Cookie: 'SOCS=CAI' } });
        if (typeof html !== 'string') throw invalid();
        let config;
        for (const match of html.matchAll(/ytcfg\.set\s*\(\s*({.+?})\s*\)\s*;/gs)) {
          try {
            const value = JSON.parse(match[1]);
            if (value.INNERTUBE_CLIENT_VERSION || value.INNERTUBE_CONTEXT?.client?.clientVersion) { config = value; break; }
          } catch { /* Only JSON configuration is read. Page JavaScript is never executed. */ }
        }
        // The ordinary HTML UI rejects non-browser User-Agents, while its public
        // JSON API can still support them. Match ytmusicapi's date-based version
        // on this recognized browser-upgrade page; visitor data remains absent.
        const browserUpgrade = html.includes('/img/on_platform_logo_dark.svg') && html.includes('google.com/chrome/index.html');
        const defaultVersion = `1.${new Date().toISOString().slice(0, 10).replaceAll('-', '')}.01.00`;
        const version = config?.INNERTUBE_CLIENT_VERSION || config?.INNERTUBE_CONTEXT?.client?.clientVersion || (browserUpgrade ? defaultVersion : undefined);
        if (typeof version !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(version)) {
          throw invalid('YouTube Music did not return recognizable public client configuration.');
        }
        const visitor = config?.VISITOR_DATA || config?.INNERTUBE_CONTEXT?.client?.visitorData;
        if (visitor !== undefined && (typeof visitor !== 'string' || visitor.length > 4096 || /[\r\n]/.test(visitor))) throw invalid();
        return { version, visitor };
      })().catch(error => { bootstrap = undefined; bootstrapExpires = 0; throw error; });
    }
    return bootstrap;
  }
  async function request(endpoint, fields) {
    const { version, visitor } = await configuration();
    const data = await http.request(`${DOMAIN}/youtubei/v1/${endpoint}?alt=json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: DOMAIN, Cookie: 'SOCS=CAI', ...(visitor ? { 'X-Goog-Visitor-Id': visitor } : {}) },
      body: JSON.stringify({ ...fields, context: { client: { clientName: 'WEB_REMIX', clientVersion: version, hl: 'en' }, user: {} } }),
    });
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.error) throw invalid();
    return data;
  }
  async function getLyrics(id) {
    if (typeof id !== 'string' || !VIDEO_ID.test(id)) throw new LyricsError('INVALID_ID', 'Select a valid song from search results.', 400);
    const selected = selectedSong(await request('next', {
      videoId: id, playlistId: 'RDAMVM' + id, enablePersistentPlaylistPanel: true, isAudioOnly: true,
      tunerSettingValue: 'AUTOMIX_SETTING_NORMAL',
      watchEndpointMusicSupportedConfigs: { watchEndpointMusicConfig: { hasPersistentPlaylistPanel: true, musicVideoType: 'MUSIC_VIDEO_TYPE_ATV' } },
    }), id);
    const lyrics = lyricText(await request('browse', { browseId: selected.browseId }));
    return { song: { ...selected.song, hasLyrics: true }, ...lyrics };
  }
  return {
    async search(query, { verifyLyrics = true } = {}) {
      const q = typeof query === 'string' ? query.trim() : '';
      if (!q || q.length > 200) throw new LyricsError('INVALID_QUERY', 'Enter a song title and/or artist (up to 200 characters).', 400);
      const candidates = searchSongs(await request('search', { query: q, params: SONGS_FILTER }));
      // Cross-provider matching checks only the best matching recordings itself.
      // A normal song search verifies every displayed result before returning it.
      if (!verifyLyrics) return { results: candidates };
      const results = [];
      const lyricsById = {};
      const verification = { checked: 0, unavailable: 0, failed: 0 };
      let firstError;
      for (const candidate of candidates) {
        verification.checked++;
        try {
          const lyrics = await getLyrics(candidate.id);
          results.push(lyrics.song);
          lyricsById[candidate.id] = lyrics;
        } catch (error) {
          // Stop before queuing another request after access/rate denial or a
          // transport failure. An outage must not trigger twenty timeout waits,
          // and none of these failures is evidence of missing lyrics.
          if (['ACCESS_DENIED', 'RATE_LIMITED', 'NETWORK_ERROR', 'TIMEOUT'].includes(error.code)) throw error;
          if (error.code === 'LYRICS_UNAVAILABLE' || error.code === 'NOT_FOUND') verification.unavailable++;
          else {
            verification.failed++;
            firstError ||= error;
          }
        }
      }
      if (!results.length && firstError) throw firstError;
      const warnings = verification.failed
        ? [`Lyrics could not be checked for ${verification.failed} recording${verification.failed === 1 ? '' : 's'}. Only verified results are shown.`]
        : [];
      return { results, lyricsById, verification, ...(warnings.length ? { warnings } : {}) };
    },
    getLyrics,
  };
}
