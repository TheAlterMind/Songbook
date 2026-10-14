import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpClient } from '../../src/lyrics/core/http.js';
import { createLyricsService } from '../../src/lyrics/core/lyrics.js';
import { createYoutubeMusicProvider } from '../../src/lyrics/core/youtube-music.js';

// Synthetic metadata and invented lyrics; response structure follows the public web client.
const VIDEO = 'Fixture_001';
const OTHER = 'Fixture_002';
const BROWSE = 'MPLYt_fixture_lyrics';
const WORDS = 'A paper satellite\nAbove an empty desk\n\nThe rain remembers home';
const BOOTSTRAP = '<script>ytcfg.set({"INNERTUBE_CLIENT_VERSION":"1.20261011.01.00","INNERTUBE_CLIENT_NAME":"WEB_REMIX","VISITOR_DATA":"fixture-visitor"});</script>';
const runs = text => ({ runs: [{ text }] });
const browseRun = (text, pageType) => ({
  text, navigationEndpoint: { browseEndpoint: {
    browseId: pageType.endsWith('ARTIST') ? 'UC_fixture_artist' : 'MPRE_fixture_album',
    browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType } },
  } },
});
const byline = () => [
  browseRun('Fixture Ensemble', 'MUSIC_PAGE_TYPE_ARTIST'), { text: ' • ' },
  browseRun('Test Record', 'MUSIC_PAGE_TYPE_ALBUM'), { text: ' • ' }, { text: '2:03' },
];
const resultItem = (id = VIDEO, title = 'Paper Satellites') => ({ musicResponsiveListItemRenderer: {
  playlistItemData: { videoId: id },
  flexColumns: [
    { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: title, navigationEndpoint: { watchEndpoint: { videoId: id } } }] } } },
    { musicResponsiveListItemFlexColumnRenderer: { text: { runs: byline() } } },
  ],
} });
const searchResponse = (...items) => ({ contents: { tabbedSearchResultsRenderer: { tabs: [{ tabRenderer: {
  content: { sectionListRenderer: { contents: [{ musicShelfRenderer: {
    title: runs('Songs'), contents: items.length ? items : [resultItem()],
  } }] } },
} }] } } });
const queueItem = (id = VIDEO, selected = true, title = 'Paper Satellites') => ({ playlistPanelVideoRenderer: {
  videoId: id, selected, title: runs(title), longBylineText: { runs: byline() },
  shortBylineText: runs('Fixture Ensemble'), lengthText: runs('2:03'),
} });
const nextResponse = ({ queue = [queueItem()], lyrics = true, unselectable = false, browseId = BROWSE } = {}) => ({
  contents: { singleColumnMusicWatchNextResultsRenderer: { tabbedRenderer: { watchNextTabbedResultsRenderer: { tabs: [
    { tabRenderer: { title: 'Up next', content: { musicQueueRenderer: { content: { playlistPanelRenderer: { contents: queue } } } } } },
    { tabRenderer: { title: 'Lyrics', unselectable, ...(lyrics ? { endpoint: { browseEndpoint: {
      browseId,
      browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_TRACK_LYRICS' } },
    } } } : {}) } },
  ] } } } },
});
const lyricsResponse = (lyrics = WORDS, source = 'Source: Musixmatch') => ({
  contents: { sectionListRenderer: { contents: [{ musicDescriptionShelfRenderer: {
    description: runs(lyrics), footer: runs(source),
  } }] } },
});

function transport(responses = {}) {
  const calls = [];
  const client = new HttpClient({ intervalMs: 0, userAgent: 'SongbookTests/1', fetchImpl: async (url, options) => {
    const target = new URL(url);
    assert.equal(target.origin, 'https://music.youtube.com');
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url: target.href, path: target.pathname, method, body, headers: options.headers });
    if (method === 'GET' && target.pathname === '/') {
      const value = typeof responses.bootstrap === 'function' ? responses.bootstrap() : responses.bootstrap;
      if (value instanceof Response) return value;
      return new Response(value ?? BOOTSTRAP, { headers: { 'Content-Type': 'text/html' } });
    }
    assert.equal(method, 'POST');
    const endpoint = target.pathname.split('/').pop();
    assert.ok(['search', 'next', 'browse'].includes(endpoint), 'Only read-only music endpoints are expected');
    const supplied = responses[endpoint];
    const value = typeof supplied === 'function' ? supplied(body) : supplied;
    if (value instanceof Response) return value;
    const data = value === undefined ? ({ search: searchResponse(), next: nextResponse(), browse: lyricsResponse() })[endpoint] : value;
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  } });
  return { client, calls, posts: () => calls.filter(call => call.method === 'POST') };
}
const errorCode = (code, status) => error => {
  assert.equal(error.code, code);
  if (status !== undefined) assert.equal(error.status, status);
  return true;
};

test('YouTube Music search and lyrics use JSON POSTs for the exact selected recording without Genius credentials', async () => {
  const wire = transport({
    search: searchResponse(resultItem(OTHER, 'Paper Satellites (Live)'), resultItem()),
    next: ({ videoId }) => videoId === OTHER
      ? nextResponse({ queue: [queueItem(OTHER)], lyrics: false })
      : nextResponse({ queue: [queueItem(OTHER, false, 'Paper Satellites (Live)'), queueItem()] }),
  });
  const service = createLyricsService({ http: wire.client, geniusToken: 'synthetic-genius-secret' });
  const { results, lyricsById, verification } = await service.search('  Paper Satellites & Fixture  ', 'youtubemusic');
  const song = results.find(item => item.id === VIDEO);
  assert.ok(song);
  assert.equal(song.title, 'Paper Satellites');
  assert.equal(song.artist, 'Fixture Ensemble');
  assert.equal(song.album, 'Test Record');
  assert.equal(song.duration, 123);
  assert.equal(song.url, `https://music.youtube.com/watch?v=${VIDEO}`);
  assert.equal(song.hasLyrics, true);
  assert.equal(Object.hasOwn(song, 'plainLyrics'), false);
  assert.deepEqual(verification, { checked: 2, unavailable: 1, failed: 0 });
  const result = lyricsById[song.id];
  assert.equal(result.song.id, VIDEO);
  assert.equal(result.song.title, song.title);
  assert.equal(result.song.provider, 'youtubemusic');
  assert.equal(result.plainLyrics, WORDS);
  assert.equal(result.syncedLyrics, null);
  assert.equal(result.attribution.name, 'Musixmatch');
  assert.equal(wire.posts().find(call => call.path.endsWith('/search')).body.query, 'Paper Satellites & Fixture');
  assert.deepEqual(wire.posts().filter(call => call.path.endsWith('/next')).map(call => call.body.videoId), [OTHER, VIDEO]);
  assert.equal(wire.posts().find(call => call.path.endsWith('/browse')).body.browseId, BROWSE);
  assert.equal(JSON.stringify(wire.calls).includes('synthetic-genius-secret'), false);
  assert.equal(JSON.stringify(result).includes('synthetic-genius-secret'), false);
  assert.ok(wire.posts().every(call => !Object.keys(call.headers).some(header => header.toLowerCase() === 'authorization')));
});

test('lyrics retrieval rejects a different selected video instead of returning its lyrics', async () => {
  const wire = transport({ next: nextResponse({ queue: [queueItem(OTHER, true, 'A Different Recording')] }) });
  const provider = createYoutubeMusicProvider({ http: wire.client });
  await assert.rejects(provider.getLyrics(VIDEO), errorCode('INVALID_RESPONSE', 502));
  assert.equal(wire.posts().filter(call => call.path.endsWith('/browse')).length, 0);
});

test('YouTube Music retains the selected recording artwork and media link', async () => {
  const item = resultItem();
  item.musicResponsiveListItemRenderer.thumbnail = { musicThumbnailRenderer: { thumbnail: { thumbnails: [
    { url: 'https://lh3.googleusercontent.com/search-art', width: 120 },
  ] } } };
  const selected = queueItem();
  selected.playlistPanelVideoRenderer.thumbnail = { thumbnails: [
    { url: 'https://lh3.googleusercontent.com/selected-small', width: 60 },
    { url: 'https://lh3.googleusercontent.com/selected-large', width: 600 },
  ] };
  const wire = transport({ search: searchResponse(item), next: nextResponse({ queue: [selected] }) });
  const provider = createYoutubeMusicProvider({ http: wire.client });
  const candidate = (await provider.search('paper', { verifyLyrics: false })).results[0];
  assert.equal(candidate.metadata.artworkUrl, 'https://lh3.googleusercontent.com/search-art');
  const result = await provider.getLyrics(candidate.id);
  assert.deepEqual(result.song.metadata, { album: 'Test Record', duration: 123,
    artworkUrl: 'https://lh3.googleusercontent.com/selected-large',
    mediaLinks: [{ kind: 'audio', label: 'YouTube Music', url: `https://music.youtube.com/watch?v=${VIDEO}` }],
  });
});

test('a missing or disabled lyrics tab returns unavailable without fetching another tab', async () => {
  for (const options of [{ lyrics: false }, { unselectable: true }]) {
    const wire = transport({ next: nextResponse(options) });
    const provider = createYoutubeMusicProvider({ http: wire.client });
    await assert.rejects(provider.getLyrics(VIDEO), errorCode('LYRICS_UNAVAILABLE', 404));
    assert.equal(wire.posts().filter(call => call.path.endsWith('/browse')).length, 0);
  }
});

test('an empty lyrics response is unavailable rather than successful empty text', async () => {
  const wire = transport({ browse: lyricsResponse('  \r\n  ') });
  const provider = createYoutubeMusicProvider({ http: wire.client });
  await assert.rejects(provider.getLyrics(VIDEO), errorCode('LYRICS_UNAVAILABLE', 404));
});

test('instrumental and no-lyrics placeholders are not returned as lyric text', async () => {
  for (const placeholder of ['[Instrumental]', '(Instrumental)', 'Instrumental', '[Instrumental]\n\n[Instrumental]', 'No lyrics available']) {
    const wire = transport({ browse: lyricsResponse(placeholder) });
    const provider = createYoutubeMusicProvider({ http: wire.client });
    await assert.rejects(provider.getLyrics(VIDEO), errorCode('LYRICS_UNAVAILABLE', 404));
  }
});

test('source credit is not invented when the upstream lyrics shelf has no footer', async () => {
  const payload = lyricsResponse();
  delete payload.contents.sectionListRenderer.contents[0].musicDescriptionShelfRenderer.footer;
  const wire = transport({ browse: payload });
  const result = await createYoutubeMusicProvider({ http: wire.client }).getLyrics(VIDEO);
  assert.equal(result.plainLyrics, WORDS);
  assert.equal(result.attribution, null);
});

test('invalid recording IDs are rejected before any network access', async () => {
  const wire = transport();
  const provider = createYoutubeMusicProvider({ http: wire.client });
  for (const id of ['', 'short', '012345678901', '../../secret', 'https://example.com/song', 'Fixture_00!', null]) {
    await assert.rejects(provider.getLyrics(id), errorCode('INVALID_ID', 400));
  }
  assert.equal(wire.calls.length, 0);
});

test('upstream access denials and rate limits stop the lyrics sequence without retries', async () => {
  for (const [status, code, expectedStatus] of [[403, 'ACCESS_DENIED', 502], [429, 'RATE_LIMITED', 429]]) {
    const wire = transport({ next: new Response('', { status, headers: { 'Retry-After': '60' } }) });
    const provider = createYoutubeMusicProvider({ http: wire.client });
    await assert.rejects(provider.getLyrics(VIDEO), errorCode(code, expectedStatus));
    assert.equal(wire.posts().length, 1);
    assert.ok(wire.posts()[0].path.endsWith('/next'));
  }
});

test('search never treats a changed response layout as a valid empty catalog', async () => {
  const wire = transport({ search: { changedLayout: { message: 'Something changed' } } });
  const provider = createYoutubeMusicProvider({ http: wire.client });
  await assert.rejects(provider.search('Paper Satellites'), errorCode('INVALID_RESPONSE', 502));
});

test('an unlinked artist in another recording does not break otherwise valid search results', async () => {
  const unlinkedArtist = resultItem(OTHER, 'Paper Satellites (Karaoke)');
  unlinkedArtist.musicResponsiveListItemRenderer.flexColumns[1].musicResponsiveListItemFlexColumnRenderer.text.runs = [
    { text: 'Unlinked Fixture Singer' }, { text: ' • ' },
    browseRun('Karaoke Test Record', 'MUSIC_PAGE_TYPE_ALBUM'), { text: ' • ' }, { text: '3:39' },
  ];
  const wire = transport({ search: searchResponse(resultItem(), unlinkedArtist) });
  const { results } = await createYoutubeMusicProvider({ http: wire.client }).search('Paper Satellites', { verifyLyrics: false });
  assert.equal(results.length, 2);
  assert.equal(results.find(song => song.id === VIDEO).artist, 'Fixture Ensemble');
  const song = results.find(item => item.id === OTHER);
  assert.equal(song.title, 'Paper Satellites (Karaoke)');
  assert.equal(song.artist, 'Unlinked Fixture Singer');
  assert.equal(song.album, 'Karaoke Test Record');
  assert.equal(song.duration, 219);
});

test('the recognized browser-upgrade page still permits the JSON API without inventing visitor data', async () => {
  const versionForToday = () => `1.${new Date().toISOString().slice(0, 10).replaceAll('-', '')}.01.00`;
  const before = versionForToday();
  const wire = transport({ bootstrap: '<html><img src="/img/on_platform_logo_dark.svg"><a href="https://www.google.com/chrome/index.html">Get a supported browser</a></html>' });
  const provider = createYoutubeMusicProvider({ http: wire.client });
  const { results } = await provider.search('Paper Satellites', { verifyLyrics: false });
  const result = await provider.getLyrics(results[0].id);
  assert.equal(result.plainLyrics, WORDS);
  assert.equal(wire.calls.filter(call => call.method === 'GET').length, 1);
  assert.equal(wire.posts().length, 3);
  for (const call of wire.posts()) {
    assert.ok([before, versionForToday()].includes(call.body.context.client.clientVersion));
    assert.equal(call.body.context.client.clientName, 'WEB_REMIX');
    assert.equal(call.body.context.client.visitorData, undefined);
    assert.equal(Object.keys(call.headers).some(key => key.toLowerCase() === 'x-goog-visitor-id'), false);
  }
});

test('an unknown homepage does not activate the browser-upgrade fallback', async () => {
  for (const bootstrap of [
    '<html>Temporary service error</html>',
    '<html><img src="/img/on_platform_logo_dark.svg">Unusual traffic</html>',
  ]) {
    const wire = transport({ bootstrap });
    const provider = createYoutubeMusicProvider({ http: wire.client });
    await assert.rejects(provider.search('Paper Satellites'), errorCode('INVALID_RESPONSE', 502));
    assert.equal(wire.calls.length, 1);
    assert.equal(wire.posts().length, 0);
  }
});

test('a failed bootstrap can recover on a later caller request without retrying the failed request automatically', async () => {
  let homeRequests = 0;
  const wire = transport({ bootstrap: () => ++homeRequests === 1
    ? new Response('', { status: 500 }) : BOOTSTRAP });
  const provider = createYoutubeMusicProvider({ http: wire.client });
  await assert.rejects(provider.search('Paper Satellites'), errorCode('UPSTREAM_ERROR', 502));
  assert.equal(homeRequests, 1);
  assert.equal(wire.posts().length, 0);
  const { results } = await provider.search('Paper Satellites');
  assert.equal(results[0].id, VIDEO);
  assert.equal(homeRequests, 2);
  const result = await provider.getLyrics(VIDEO);
  assert.equal(result.plainLyrics, WORDS);
  assert.equal(homeRequests, 2, 'Successful public configuration should be reused');
});

test('default search omits disabled lyrics, empty lyrics, and instrumentals while retaining verified text', async () => {
  const ids = [VIDEO, OTHER, 'Fixture_003', 'Fixture_004', 'Fixture_005'];
  const wire = transport({
    search: searchResponse(...ids.map(id => resultItem(id))),
    next: ({ videoId }) => nextResponse({ queue: [queueItem(videoId)], unselectable: videoId === OTHER, browseId: 'MPLY_' + videoId }),
    browse: ({ browseId }) => lyricsResponse(browseId === 'MPLY_Fixture_003' ? ' \r\n '
      : browseId === 'MPLY_Fixture_004' ? '[Instrumental]' : WORDS),
  });
  const data = await createYoutubeMusicProvider({ http: wire.client }).search('Paper Satellites');
  assert.deepEqual(data.results.map(song => song.id), [VIDEO, 'Fixture_005']);
  assert.ok(data.results.every(song => song.hasLyrics === true));
  assert.deepEqual(Object.keys(data.lyricsById), [VIDEO, 'Fixture_005']);
  assert.ok(Object.values(data.lyricsById).every(lyrics => lyrics.plainLyrics === WORDS));
  assert.deepEqual(data.verification, { checked: 5, unavailable: 3, failed: 0 });
  assert.equal(data.warnings, undefined);
  assert.equal(wire.posts().filter(call => call.path.endsWith('/browse')).length, 4);
});

test('targeted matching can request raw candidates without checking unrelated recordings', async () => {
  const wire = transport({ search: searchResponse(resultItem(), resultItem(OTHER)) });
  const data = await createYoutubeMusicProvider({ http: wire.client }).search('Paper Satellites', { verifyLyrics: false });
  assert.deepEqual(data.results.map(song => song.id), [VIDEO, OTHER]);
  assert.ok(data.results.every(song => song.hasLyrics === null));
  assert.equal(data.lyricsById, undefined);
  assert.equal(data.verification, undefined);
  assert.equal(wire.calls.length, 2);
  assert.equal(wire.posts().length, 1);
  assert.ok(wire.posts()[0].path.endsWith('/search'));
});

test('verified search caps unique candidates at twenty and stays within forty-two upstream requests', async () => {
  const ids = Array.from({ length: 25 }, (_, i) => 'Record_' + String(i).padStart(4, '0'));
  const wire = transport({
    search: searchResponse(resultItem(ids[0]), ...ids.map(id => resultItem(id))),
    next: ({ videoId }) => nextResponse({ queue: [queueItem(videoId)] }),
  });
  const data = await createYoutubeMusicProvider({ http: wire.client }).search('Paper Satellites');
  assert.deepEqual(data.results.map(song => song.id), ids.slice(0, 20));
  assert.deepEqual(data.verification, { checked: 20, unavailable: 0, failed: 0 });
  assert.equal(wire.calls.length, 42);
});

test('verified search stops immediately on a provider access denial or rate limit', async () => {
  for (const [status, code, expectedStatus] of [[403, 'ACCESS_DENIED', 502], [429, 'RATE_LIMITED', 429]]) {
    const wire = transport({
      search: searchResponse(resultItem(), resultItem(OTHER)),
      next: new Response('', { status, headers: { 'Retry-After': '60' } }),
    });
    await assert.rejects(createYoutubeMusicProvider({ http: wire.client }).search('Paper Satellites'), errorCode(code, expectedStatus));
    assert.equal(wire.posts().filter(call => call.path.endsWith('/next')).length, 1);
    assert.equal(wire.posts().filter(call => call.path.endsWith('/browse')).length, 0);
  }
});

test('partial verification failure is reported alongside only successful lyric matches', async () => {
  const wire = transport({
    search: searchResponse(resultItem(), resultItem(OTHER)),
    next: ({ videoId }) => videoId === OTHER ? new Response('', { status: 500 }) : nextResponse(),
  });
  const data = await createYoutubeMusicProvider({ http: wire.client }).search('Paper Satellites');
  assert.deepEqual(data.results.map(song => song.id), [VIDEO]);
  assert.deepEqual(data.verification, { checked: 2, unavailable: 0, failed: 1 });
  assert.equal(data.warnings.length, 1);
  assert.match(data.warnings[0], /could not be checked for 1 recording/);
  assert.deepEqual(Object.keys(data.lyricsById), [VIDEO]);
});

test('network failures and timeouts stop verification before probing more recordings', async () => {
  for (const [name, code, status] of [['TypeError', 'NETWORK_ERROR', 502], ['TimeoutError', 'TIMEOUT', 504]]) {
    for (const failFirst of [true, false]) {
      const wire = transport({
        search: searchResponse(resultItem(), resultItem(OTHER), resultItem('Fixture_003')),
        next: ({ videoId }) => {
          if (failFirst || videoId === OTHER) throw Object.assign(new Error('Synthetic transport failure'), { name });
          return nextResponse();
        },
      });
      await assert.rejects(createYoutubeMusicProvider({ http: wire.client }).search('Paper Satellites'), errorCode(code, status));
      assert.deepEqual(wire.posts().filter(call => call.path.endsWith('/next')).map(call => call.body.videoId),
        failFirst ? [VIDEO] : [VIDEO, OTHER]);
      assert.equal(wire.posts().filter(call => call.path.endsWith('/browse')).length, failFirst ? 0 : 1);
    }
  }
});

test('failed verification cannot masquerade as an empty catalog or unavailable lyrics', async () => {
  const wire = transport({
    search: searchResponse(resultItem(), resultItem(OTHER)),
    next: ({ videoId }) => videoId === VIDEO ? new Response('', { status: 500 })
      : nextResponse({ queue: [queueItem(OTHER)], lyrics: false }),
  });
  await assert.rejects(createYoutubeMusicProvider({ http: wire.client }).search('Paper Satellites'), errorCode('UPSTREAM_ERROR', 502));
});

test('confirmed unavailable recordings return an empty verified catalog with an honest checked count', async () => {
  const wire = transport({
    search: searchResponse(resultItem(), resultItem(OTHER)),
    next: ({ videoId }) => nextResponse({ queue: [queueItem(videoId)], lyrics: false }),
  });
  const data = await createYoutubeMusicProvider({ http: wire.client }).search('Paper Satellites');
  assert.deepEqual(data.results, []);
  assert.deepEqual(data.lyricsById, {});
  assert.deepEqual(data.verification, { checked: 2, unavailable: 2, failed: 0 });
  assert.equal(data.warnings, undefined);
});
