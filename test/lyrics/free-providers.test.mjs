import assert from 'node:assert/strict';
import test from 'node:test';
import { createLyricsService } from '../../src/lyrics/core/lyrics.js';
import { LyricsError } from '../../src/lyrics/core/http.js';
import { parseTtml } from '../../src/lyrics/core/free-providers.js';

// All lyrics and artists here are synthetic fixtures, never downloaded songs.
const inventedPlain = 'A paper satellite\nAbove an empty desk';
const inventedSynced = '[00:01.25]A paper satellite\n[00:02.50]Above an empty desk';
const ovhRecord = overrides => ({
  id: 701, title: 'Paper Satellites', artist: { name: 'Fixture Ensemble' },
  album: { title: 'Test Record' }, duration: 123.5, ...overrides,
});
const syncRecord = overrides => ({
  id: '0123456789abcdef0123456789abcdef', track: 'Paper Satellites',
  artist: 'Fixture Ensemble', album: 'Test Record', duration: 123.5,
  instrumental: false, lyrics: { plain: inventedPlain, synced: inventedSynced, karaoke: null },
  ...overrides,
});
const lrclibRecord = overrides => ({
  id: 42, trackName: 'Paper Satellites', artistName: 'Fixture Ensemble',
  albumName: 'Test Record', duration: 123.5, instrumental: false,
  plainLyrics: 'This text belongs only to the metadata provider', syncedLyrics: null,
  ...overrides,
});
const ttml = `<tt xmlns="http://www.w3.org/ns/ttml"><head><metadata>Unrelated title</metadata></head><body><div><p begin="00:00:01.250"><span>A paper</span> <span>satellite</span></p><p begin="2.5s">Above an empty desk</p></div></body></tt>`;

function fakeHttp(...responses) {
  const calls = [];
  return {
    calls,
    async request(url, options) {
      calls.push({ url: String(url), options });
      assert.ok(responses.length, 'An unexpected extra provider request was made');
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response;
    },
  };
}
const errorCode = (code, status) => error => {
  assert.equal(error.code, code);
  assert.equal(error.status, status);
  return true;
};
const serviceFor = http => createLyricsService({ http, geniusToken: 'fixture-genius-secret' });
const assertNoSecret = (http, value) => {
  assert.equal(JSON.stringify(http.calls).includes('fixture-genius-secret'), false);
  assert.equal(JSON.stringify(value).includes('fixture-genius-secret'), false);
};

test('free providers are enabled without accounts or a Genius token', () => {
  const providers = createLyricsService({ geniusToken: '' }).config().providers;
  for (const id of ['lyricsovh', 'synclrc', 'betterlyrics']) {
    assert.equal(providers.find(provider => provider.id === id)?.enabled, true);
    assert.equal(providers.find(provider => provider.id === id)?.lyricsMode, 'inline');
  }
});

test('lyrics.ovh selections encode Unicode metadata and retrieve lyrics only from its API', async () => {
  const http = fakeHttp(
    { data: [ovhRecord({ title: 'Паперові / супутники?', artist: { name: 'Хор & Company' } })] },
    { lyrics: '  Паперовий супутник\r\nНад порожнім столом\r\n' },
  );
  const service = serviceFor(http);
  const { results } = await service.search('  Папір / & хоровий  ', 'lyricsovh');
  assert.equal(results.length, 1);
  const song = results[0];
  assert.equal(song.provider, 'lyricsovh');
  assert.equal(song.title, 'Паперові / супутники?');
  assert.equal(song.artist, 'Хор & Company');
  assert.match(song.id, /^v1\.[A-Za-z0-9_-]+$/);
  assert.equal(Object.hasOwn(song, 'plainLyrics'), false);
  assert.equal(song.hasLyrics, null);
  const result = await service.getLyrics('lyricsovh', song.id);
  assert.equal(result.song.id, song.id);
  assert.equal(result.plainLyrics, 'Паперовий супутник\nНад порожнім столом');
  assert.equal(result.syncedLyrics, null);
  assert.equal(http.calls[0].url, `https://api.lyrics.ovh/suggest/${encodeURIComponent('Папір / & хоровий')}`);
  assert.equal(http.calls[1].url, `https://api.lyrics.ovh/v1/${encodeURIComponent('Хор & Company')}/${encodeURIComponent('Паперові / супутники?')}`);
  assertNoSecret(http, result);
});

test('lyrics.ovh missing lyric responses have a clear unavailable outcome', async () => {
  for (const response of [{ lyrics: '' }, { lyrics: ' \r\n ' }, { lyrics: null }, new LyricsError('NOT_FOUND', 'Missing', 404)]) {
    const http = fakeHttp({ data: [ovhRecord()] }, response);
    const service = serviceFor(http);
    const { results } = await service.search('paper', 'lyricsovh');
    await assert.rejects(service.getLyrics('lyricsovh', results[0].id), errorCode('LYRICS_UNAVAILABLE', 404));
    assert.equal(http.calls.length, 2);
  }
});

test('SyncLRC retains exact selected versions and reuses the original search query', async () => {
  const studio = syncRecord();
  // SyncLRC can reuse a canonical ID for recordings with different metadata.
  const live = syncRecord({ track: 'Paper Satellites (Live)', duration: 145 });
  const http = fakeHttp({ results: [studio, live] }, { results: [live, studio] });
  const service = serviceFor(http);
  const { results } = await service.search('  paper & fixture  ', 'synclrc');
  assert.equal(results.length, 2);
  assert.notEqual(results[0].id, results[1].id);
  assert.equal(JSON.stringify(results).includes(inventedPlain), false);
  assert.equal(JSON.stringify(results).includes(inventedSynced), false);
  const result = await service.getLyrics('synclrc', results[1].id);
  assert.equal(result.song.title, 'Paper Satellites (Live)');
  assert.equal(result.song.id, results[1].id);
  assert.equal(result.plainLyrics, inventedPlain);
  assert.equal(result.syncedLyrics, inventedSynced);
  assert.equal(http.calls[0].url, http.calls[1].url);
  const url = new URL(http.calls[1].url);
  assert.equal(url.origin, 'https://api.synclrc.dev');
  assert.equal(url.pathname, '/search');
  assert.equal(url.searchParams.get('q'), 'paper & fixture');
  assert.equal(url.searchParams.get('limit'), '10');
  assertNoSecret(http, result);
});

test('SyncLRC does not substitute a changed or missing song after selection', async () => {
  for (const records of [[], [syncRecord({ track: 'An Unrelated Song' })], [syncRecord({ duration: 999 })]]) {
    const http = fakeHttp({ results: [syncRecord()] }, { results: records });
    const service = serviceFor(http);
    const { results } = await service.search('paper', 'synclrc');
    await assert.rejects(service.getLyrics('synclrc', results[0].id), errorCode('NOT_FOUND', 404));
    assert.equal(http.calls.length, 2);
  }
});

test('SyncLRC rejects conflicting lyric bodies for an otherwise identical selection', async () => {
  const http = fakeHttp({ results: [syncRecord()] }, { results: [
    syncRecord(), syncRecord({ lyrics: { plain: 'Conflicting invented line', synced: null, karaoke: null } }),
  ] });
  const service = serviceFor(http);
  const { results } = await service.search('paper', 'synclrc');
  await assert.rejects(service.getLyrics('synclrc', results[0].id), errorCode('INVALID_RESPONSE', 502));
});

test('SyncLRC converts timed-only lyrics and distinguishes instrumentals from missing words', async () => {
  const cases = [
    [syncRecord({ lyrics: { plain: null, synced: inventedSynced, karaoke: null } }), inventedPlain, false],
    [syncRecord({ instrumental: true, lyrics: { plain: null, synced: null, karaoke: null } }), null, true],
  ];
  for (const [record, plain, instrumental] of cases) {
    const http = fakeHttp({ results: [record] }, { results: [record] });
    const service = serviceFor(http);
    const { results } = await service.search('paper', 'synclrc');
    const result = await service.getLyrics('synclrc', results[0].id);
    assert.equal(result.plainLyrics, plain);
    assert.equal(result.song.instrumental, instrumental);
  }
});

test('Better Lyrics uses LRCLIB only for metadata and returns its own parsed TTML', async () => {
  const http = fakeHttp([lrclibRecord()], lrclibRecord(), { ttml });
  const service = serviceFor(http);
  const { results } = await service.search('paper & fixture', 'betterlyrics');
  assert.equal(results[0].provider, 'betterlyrics');
  assert.equal(results[0].id, '42');
  assert.equal(results[0].hasLyrics, null);
  assert.equal(JSON.stringify(results).includes('only to the metadata provider'), false);
  const result = await service.getLyrics('betterlyrics', results[0].id);
  assert.equal(result.song.provider, 'betterlyrics');
  assert.equal(result.plainLyrics, inventedPlain);
  assert.equal(result.syncedLyrics, inventedSynced);
  assert.equal(http.calls[1].url, 'https://lrclib.net/api/get/42');
  const url = new URL(http.calls[2].url);
  assert.equal(url.origin, 'https://api.betterlyrics.org');
  assert.equal(url.pathname, '/getLyrics');
  assert.equal(url.searchParams.get('s'), 'Paper Satellites');
  assert.equal(url.searchParams.get('a'), 'Fixture Ensemble');
  assert.equal(url.searchParams.get('al'), 'Test Record');
  assert.equal(url.searchParams.get('d'), '124');
  assertNoSecret(http, result);
});

test('Better Lyrics unavailable cache never falls back to the metadata provider lyric text', async () => {
  for (const error of [new LyricsError('ACCESS_DENIED', 'Cache miss', 502), new LyricsError('NOT_FOUND', 'Missing', 404)]) {
    const http = fakeHttp(lrclibRecord(), error);
    await assert.rejects(serviceFor(http).getLyrics('betterlyrics', '42'), errorCode('LYRICS_UNAVAILABLE', 404));
    assert.equal(http.calls.length, 2);
  }
});

test('Better Lyrics refuses a mismatched metadata record before lyric lookup', async () => {
  const http = fakeHttp(lrclibRecord({ id: 99 }));
  await assert.rejects(serviceFor(http).getLyrics('betterlyrics', '42'), errorCode('INVALID_RESPONSE', 502));
  assert.equal(http.calls.length, 1);
});

test('free provider throttling and network failures remain actionable typed errors', async () => {
  for (const provider of ['lyricsovh', 'synclrc', 'betterlyrics']) {
    for (const error of [new LyricsError('RATE_LIMITED', 'Try later', 429, 90), new LyricsError('TIMEOUT', 'Too slow', 504)]) {
      const http = fakeHttp(error);
      await assert.rejects(serviceFor(http).search('paper', provider), actual => {
        assert.equal(actual, error);
        return true;
      });
      assert.equal(http.calls.length, 1);
    }
  }
});

test('malformed and oversized selection IDs cannot trigger outbound requests', async () => {
  const malformedOpaque = [
    '', null, '../private', 'https://attacker.example/lyrics', 'v1.', 'v1.@@@',
    `v1.${Buffer.from('null').toString('base64url')}`,
    `v1.${Buffer.from('{}').toString('base64url')}`,
    `v1.${Buffer.from('{"url":"http://127.0.0.1/private"}').toString('base64url')}`,
    `v1.${'a'.repeat(100_000)}`,
  ];
  for (const provider of ['lyricsovh', 'synclrc']) {
    const http = fakeHttp();
    const service = serviceFor(http);
    for (const id of malformedOpaque) {
      await assert.rejects(service.getLyrics(provider, id), errorCode('INVALID_ID', 400));
    }
    assert.equal(http.calls.length, 0);
  }
  const http = fakeHttp();
  for (const id of ['https://attacker.example', '-1', '42/other', '1?token=x', '1234567890123456']) {
    await assert.rejects(serviceFor(http).getLyrics('betterlyrics', id), errorCode('INVALID_ID', 400));
  }
  assert.equal(http.calls.length, 0);
});

test('selection IDs cannot cross free providers', async () => {
  const http = fakeHttp({ data: [ovhRecord()] }, { results: [syncRecord()] });
  const service = serviceFor(http);
  const ovh = (await service.search('paper', 'lyricsovh')).results[0];
  const sync = (await service.search('paper', 'synclrc')).results[0];
  await assert.rejects(service.getLyrics('synclrc', ovh.id), errorCode('INVALID_ID', 400));
  await assert.rejects(service.getLyrics('lyricsovh', sync.id), errorCode('INVALID_ID', 400));
  assert.equal(http.calls.length, 2);
});

test('malformed search payloads produce provider errors instead of invented records', async () => {
  const cases = [
    ['lyricsovh', null], ['lyricsovh', { data: [ovhRecord({ title: '' })] }],
    ['synclrc', { results: [syncRecord({ id: '../../private' })] }],
    ['synclrc', { results: [syncRecord({ artist: '' })] }],
    ['betterlyrics', { results: [] }], ['betterlyrics', [lrclibRecord({ artistName: '' })]],
  ];
  for (const [provider, response] of cases) {
    await assert.rejects(serviceFor(fakeHttp(response)).search('paper', provider), errorCode('INVALID_RESPONSE', 502));
  }
});

test('TTML handles clock and second timing without importing metadata text', () => {
  assert.deepEqual(parseTtml(ttml), { plainLyrics: inventedPlain, syncedLyrics: inventedSynced });
});

test('TTML preserves namespaced Unicode words, span spacing, entities, and explicit line breaks', () => {
  const xml = `<t:tt xmlns:t="http://www.w3.org/ns/ttml"><t:body><t:div><t:p begin="1s"><t:span>Тихий</t:span> <t:span>супутник</t:span><t:br/>Fold &amp; fly</t:p><t:p begin="2s">A <t:span>paper</t:span> world</t:p></t:div></t:body></t:tt>`;
  const result = parseTtml(xml);
  assert.equal(result.plainLyrics, 'Тихий супутник\nFold & fly\nA paper world');
  assert.ok(result.syncedLyrics.includes('[00:01.00]'));
  assert.ok(result.syncedLyrics.includes('[00:02.00]A paper world'));
});

test('TTML without usable complete line timing remains plain text', () => {
  for (const paragraphs of [
    '<p>A paper satellite</p><p>Above an empty desk</p>',
    '<p begin="1s">A paper satellite</p><p>Above an empty desk</p>',
    '<p begin="not-a-time">A paper satellite</p><p begin="2s">Above an empty desk</p>',
  ]) {
    assert.deepEqual(parseTtml(`<tt><body><div>${paragraphs}</div></body></tt>`), { plainLyrics: inventedPlain, syncedLyrics: null });
  }
});

test('TTML rejects missing, empty, or non-lyric responses', () => {
  for (const xml of [null, '', 'not XML', '<html><body>Request denied</body></html>', '<tt><head><p>Metadata only</p></head></tt>', '<tt><body><p> \n </p></body></tt>']) {
    assert.throws(() => parseTtml(xml), errorCode('INVALID_RESPONSE', 502));
  }
});
