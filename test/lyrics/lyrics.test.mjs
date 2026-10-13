import assert from 'node:assert/strict';
import test from 'node:test';
import { createLyricsService, extractGeniusLyrics, plainFromLrc } from '../../src/lyrics/core/lyrics.js';
import { HttpClient } from '../../src/lyrics/core/http.js';

// All lyric fixtures in this suite are invented solely for these tests.
const lrclibRecord = overrides => ({
  id: 42, trackName: 'Paper Satellites', artistName: 'Fixture Ensemble',
  albumName: 'Test Record', duration: 123.5, instrumental: false,
  plainLyrics: 'A paper satellite\nAbove an empty desk', syncedLyrics: null,
  ...overrides,
});
const geniusRecord = overrides => ({
  id: 81, title: 'Paper Satellites', primary_artist: { name: 'Fixture Ensemble' },
  url: 'https://genius.com/Fixture-ensemble-paper-satellites-lyrics',
  ...overrides,
});
function fakeHttp(...responses) {
  const calls = [];
  return {
    calls,
    async request(url, options) {
      calls.push({ url, options });
      assert.ok(responses.length, 'An unexpected extra provider request was made');
      return responses.shift();
    },
  };
}
const errorCode = (code, status) => error => {
  assert.equal(error.code, code);
  if (status !== undefined) assert.equal(error.status, status);
  return true;
};

test('LRCLIB search encodes user text and returns portable song metadata', async () => {
  const http = fakeHttp([lrclibRecord({ trackName: ' Paper Satellites ', albumName: '' })]);
  const service = createLyricsService({ http, geniusToken: '' });
  assert.deepEqual(await service.search('  paper & satellites + ensemble  '), { results: [{
    id: '42', provider: 'lrclib', title: 'Paper Satellites', artist: 'Fixture Ensemble',
    album: null, duration: 123.5, url: 'https://lrclib.net/api/get/42',
    instrumental: false, hasLyrics: true,
  }] });
  const url = new URL(http.calls[0].url);
  assert.equal(url.origin, 'https://lrclib.net');
  assert.equal(url.searchParams.get('q'), 'paper & satellites + ensemble');
  assert.equal([...url.searchParams].length, 1);
});

test('LRCLIB preserves line breaks and synchronized data', async () => {
  const synced = '[00:01.00]A paper satellite\n[00:02.50]Above an empty desk';
  const service = createLyricsService({ http: fakeHttp(lrclibRecord({
    plainLyrics: '  A paper satellite\r\nAbove an empty desk\r\n', syncedLyrics: synced,
  })) });
  const result = await service.getLyrics('lrclib', '42');
  assert.equal(result.plainLyrics, 'A paper satellite\nAbove an empty desk');
  assert.equal(result.syncedLyrics, synced);
});

test('synchronized-only records produce readable text without timestamps or metadata', async () => {
  const synced = '[ar:Fixture Ensemble]\n[ti:Paper Satellites]\n[offset:0]\n[00:01.00][00:05.00]A <00:01.20>paper <00:01.60>satellite\n[00:02:50]Above an empty desk';
  const service = createLyricsService({ http: fakeHttp(lrclibRecord({ plainLyrics: null, syncedLyrics: synced })) });
  const result = await service.getLyrics('lrclib', 42);
  assert.equal(result.plainLyrics, 'A paper satellite\nAbove an empty desk');
  assert.equal(result.syncedLyrics, synced);
  assert.equal(plainFromLrc('[ar:Fixture Ensemble]\n[00:00.00]'), null);
});

test('instrumentals are distinct from missing lyrics', async () => {
  const http = fakeHttp(
    lrclibRecord({ plainLyrics: null, instrumental: true }),
    lrclibRecord({ plainLyrics: null, instrumental: false }),
  );
  const service = createLyricsService({ http });
  const instrumental = await service.getLyrics('lrclib', 42);
  assert.equal(instrumental.song.instrumental, true);
  assert.equal(instrumental.plainLyrics, null);
  await assert.rejects(service.getLyrics('lrclib', 42), errorCode('LYRICS_UNAVAILABLE', 404));
});

test('Genius search filters non-song hits and normalizes its different metadata shape', async () => {
  const http = fakeHttp({ response: { hits: [
    { type: 'artist', result: { name: 'Unrelated artist' } },
    { type: 'song', result: geniusRecord({ album: { name: ' Test Record ' } }) },
  ] } });
  const service = createLyricsService({ http, geniusToken: 'test-token' });
  assert.deepEqual(await service.search('paper', 'genius'), { results: [{
    id: '81', provider: 'genius', title: 'Paper Satellites', artist: 'Fixture Ensemble',
    album: 'Test Record', duration: null,
    url: 'https://genius.com/Fixture-ensemble-paper-satellites-lyrics',
    instrumental: null, hasLyrics: null,
  }] });
  assert.deepEqual(http.calls, [{
    url: 'https://api.genius.com/search?q=paper',
    options: { headers: { Authorization: 'Bearer test-token' } },
  }]);
});

test('Genius imports webpage lyrics after validating API metadata, without sending the API token to the webpage', async () => {
  const song = geniusRecord();
  const http = fakeHttp({ response: { song } }, '<div data-lyrics-container="true">A paper satellite<br>Above an empty desk</div>');
  const service = createLyricsService({ http, geniusToken: '  test-secret-token  ' });
  const result = await service.getLyrics('genius', 81);
  assert.deepEqual(result.song, {
    id: '81', provider: 'genius', title: 'Paper Satellites', artist: 'Fixture Ensemble',
    album: null, duration: null, url: song.url, instrumental: null, hasLyrics: true,
  });
  assert.equal(result.plainLyrics, 'A paper satellite\nAbove an empty desk');
  assert.equal(result.syncedLyrics, null);
  assert.equal(result.lyricsStatus, 'available');
  assert.deepEqual(http.calls, [
    { url: 'https://api.genius.com/songs/81', options: { headers: { Authorization: 'Bearer test-secret-token' } } },
    { url: song.url, options: { json: false } },
  ]);
  assert.equal(JSON.stringify(result).includes('test-secret-token'), false);
  assert.equal(JSON.stringify(service.config()).includes('test-secret-token'), false);
});

test('a Genius search hit without an album imports the same acoustic live record with its detailed album', async () => {
  const searchSong = geniusRecord({ title: 'Paper Satellites (Acoustic Live)' });
  const detailSong = { ...searchSong, album: { name: 'Unplugged' } };
  const http = fakeHttp(
    { response: { hits: [{ type: 'song', result: searchSong }] } },
    { response: { song: detailSong } },
    '<div data-lyrics-container="true">A paper satellite<br>Above an empty desk</div>',
  );
  const service = createLyricsService({ http, geniusToken: 'test-token' });
  const { results } = await service.search('paper satellites fixture ensemble', 'genius');
  assert.equal(results[0].album, null);
  const result = await service.findLyrics(results[0], 'genius');
  assert.equal(result.song.id, '81');
  assert.equal(result.song.title, searchSong.title);
  assert.equal(result.song.album, 'Unplugged');
  assert.equal(result.match.kind, 'same-recording');
  assert.equal(result.plainLyrics, 'A paper satellite\nAbove an empty desk');
  assert.deepEqual(http.calls.map(call => call.url), [
    'https://api.genius.com/search?q=paper+satellites+fixture+ensemble',
    'https://api.genius.com/songs/81',
    searchSong.url,
  ]);
});

test('configuration advertises inline lyrics from configured providers', () => {
  const service = createLyricsService({ geniusToken: 'test-token' });
  assert.deepEqual(service.config(), { providers: [
    { id: 'lrclib', name: 'LRCLIB', enabled: true, lyricsMode: 'inline' },
    { id: 'genius', name: 'Genius', enabled: true, lyricsMode: 'inline' },
    { id: 'lyricsovh', name: 'Lyrics.ovh', enabled: true, lyricsMode: 'inline' },
    { id: 'synclrc', name: 'SyncLRC', enabled: true, lyricsMode: 'inline' },
    { id: 'betterlyrics', name: 'Better Lyrics', enabled: true, lyricsMode: 'inline' },
    { id: 'youtubemusic', name: 'YouTube Music (Google)', enabled: true, lyricsMode: 'inline' },
  ] });
});

test('Genius extraction preserves annotated text, entities, line breaks, and stanzas across modern containers', () => {
  const html = `<!doctype html><html><body>
    <h1>Paper Satellites</h1><div>Unrelated page text</div>
    <div data-lyrics-container="true">[Verse 1]<br>A <a href="/annotations/1"><span>paper</span> satellite<br>Above an empty desk<br><br>Fold &amp; fly&nbsp;again</div>
    <aside>Recommended songs</aside>
    <div data-lyrics-container="true">[Chorus]<br><b>Turn</b> the page &lt;slowly&gt;<br>Our &quot;orbit&quot; begins</div>
  </body></html>`;
  assert.equal(extractGeniusLyrics(html), '[Verse 1]\nA paper satellite\nAbove an empty desk\n\nFold & fly again\n\n[Chorus]\nTurn the page <slowly>\nOur "orbit" begins');
});

test('Genius extraction removes controls and page decoration inside lyric containers', () => {
  const html = `<div data-lyrics-container="true"><h1>Page heading</h1><h2>Paper Satellites Lyrics</h2><button>Read more</button><script>privateTrackingData()</script><style>.ad { display: block; }</style><noscript>Enable JavaScript</noscript><div data-exclude-from-selection="true">You might also like</div><div data-exclude-from-selection="true">Advertisement</div>A paper satellite<br>Above an empty desk</div>`;
  assert.equal(extractGeniusLyrics(html), 'A paper satellite\nAbove an empty desk');
});

test('Genius extraction supports legacy lyrics and prefers modern containers when both layouts exist', () => {
  assert.equal(extractGeniusLyrics('<div class="lyrics">\n<p>[Verse]<br>A <a>paper satellite</a><br><br>Above an empty desk</p>\n</div>'), '[Verse]\nA paper satellite\n\nAbove an empty desk');
  assert.equal(extractGeniusLyrics('<div class="lyrics">Stale duplicate</div><div data-lyrics-container="true">A paper satellite</div>'), 'A paper satellite');
});

test('Genius extraction rejects missing lyrics, empty containers, and challenge pages with typed errors', () => {
  for (const html of [
    '', '<html><body>Song details without lyrics</body></html>',
    '<div data-lyrics-container="true"> \n<br>&nbsp; </div>',
    '<div data-lyrics-container="true"><h2>Paper Satellites Lyrics</h2><button>Read more</button></div>',
    '<html><title>Just a moment...</title><body>Verify you are human</body></html>',
  ]) {
    assert.throws(() => extractGeniusLyrics(html), errorCode('EXTRACTION_FAILED', 502));
  }
});

test('Genius webpage denial and layout changes remain typed failures with no follow-up attempts', async () => {
  for (const [status, body, expectedCode] of [
    [403, '<html>Access denied</html>', 'ACCESS_DENIED'],
    [200, '<html><title>Just a moment...</title><body>Verify you are human</body></html>', 'EXTRACTION_FAILED'],
    [200, '<main>Song details without recognizable lyrics</main>', 'EXTRACTION_FAILED'],
  ]) {
    const calls = [];
    const song = geniusRecord();
    const http = new HttpClient({ intervalMs: 0, fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url === 'https://api.genius.com/songs/81') {
        return new Response(JSON.stringify({ response: { song } }));
      }
      assert.equal(url, song.url);
      return new Response(body, { status });
    } });
    const service = createLyricsService({ http, geniusToken: 'synthetic-token' });
    await assert.rejects(service.getLyrics('genius', 81), errorCode(expectedCode, 502));
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer synthetic-token');
    assert.equal(calls[1].options.headers.Accept, 'text/html');
    assert.equal(new Headers(calls[1].options.headers).has('authorization'), false);
    assert.equal(calls[1].options.redirect, 'manual');
  }
});

test('invalid queries, IDs, and providers are rejected before any network access', async () => {
  const http = fakeHttp();
  const service = createLyricsService({ http, geniusToken: 'test-token' });
  for (const query of ['', '  ', null, 42, 'x'.repeat(201)]) {
    await assert.rejects(service.search(query), errorCode('INVALID_QUERY', 400));
  }
  for (const id of ['', null, 0, -2, '42/other', '../secret', '1?token=secret', '1e3', '1234567890123456']) {
    await assert.rejects(service.getLyrics('lrclib', id), errorCode('INVALID_ID', 400));
  }
  await assert.rejects(service.search('paper', 'unknown'), errorCode('INVALID_PROVIDER', 400));
  await assert.rejects(service.getLyrics('unknown', 42), errorCode('INVALID_PROVIDER', 400));
  assert.equal(http.calls.length, 0);
});

test('Genius stays disabled without a configured token', async () => {
  const http = fakeHttp();
  const service = createLyricsService({ http, geniusToken: '  ' });
  assert.equal(service.config().providers.find(provider => provider.id === 'genius').enabled, false);
  await assert.rejects(service.search('paper', 'genius'), errorCode('NOT_CONFIGURED', 503));
  await assert.rejects(service.getLyrics('genius', 81), errorCode('NOT_CONFIGURED', 503));
  assert.equal(http.calls.length, 0);
});

test('Genius source links reject unexpected hosts, protocols, and credentials', async () => {
  for (const url of [
    'http://genius.com/a', 'https://genius.com.evil.example/a', 'https://evil.example/a',
    'https://genius.com@evil.example/a', 'https://user:password@genius.com/a',
    'https://genius.com:8443/a', 'file:///etc/passwd', 'not a URL',
  ]) {
    const http = fakeHttp({ response: { song: geniusRecord({ url }) } });
    const service = createLyricsService({ http, geniusToken: 'test-token' });
    await assert.rejects(service.getLyrics('genius', 81), errorCode('INVALID_RESPONSE', 502));
    assert.equal(http.calls.length, 1, `Invalid source URL must not trigger another request: ${url}`);
  }
});

test('a provider cannot silently return lyrics for a different selected song', async () => {
  const lrclib = createLyricsService({ http: fakeHttp(lrclibRecord({ id: 43 })) });
  await assert.rejects(lrclib.getLyrics('lrclib', 42), errorCode('INVALID_RESPONSE', 502));
  const http = fakeHttp({ response: { song: geniusRecord({ id: 82 }) } });
  const genius = createLyricsService({ http, geniusToken: 'test-token' });
  await assert.rejects(genius.getLyrics('genius', 81), errorCode('INVALID_RESPONSE', 502));
  assert.equal(http.calls.length, 1);
});

test('malformed provider payloads become typed errors', async () => {
  for (const payload of [{ results: [] }, [null], [lrclibRecord({ artistName: '' })]]) {
    const service = createLyricsService({ http: fakeHttp(payload) });
    await assert.rejects(service.search('paper'), errorCode('INVALID_RESPONSE', 502));
  }
  for (const payload of [null, { response: {} }, { response: { hits: [null] } }]) {
    const service = createLyricsService({ http: fakeHttp(payload), geniusToken: 'test-token' });
    await assert.rejects(service.search('paper', 'genius'), errorCode('INVALID_RESPONSE', 502));
  }
});
