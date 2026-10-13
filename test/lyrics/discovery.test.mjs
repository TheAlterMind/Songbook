import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createDeviceLyricsService, PROVIDERS } from '../../src/lyrics/core/discovery.js';
import { createProviderLookup } from '../../src/lyrics/core/provider-lookup.js';
import { LyricsError } from '../../src/lyrics/core/http.js';

// Entirely invented metadata/lyrics. These tests exercise orchestration through
// the real conservative matcher, with provider outcomes controlled by fixtures.
const original = { id: '81', provider: 'genius', title: 'Paper Satellites', artist: 'Fixture Ensemble', album: 'Test Record', duration: 123, url: 'https://genius.com/fixture', instrumental: false, hasLyrics: null };
const words = 'A paper satellite\nAbove an empty desk\n\nThe rain remembers home';
const result = (provider, extra = {}) => ({
  song: { ...original, provider, id: provider === 'genius' ? original.id : `${provider}-fixture`, hasLyrics: true },
  plainLyrics: words, syncedLyrics: null, attribution: { name: 'Fixture source', text: 'Source: Fixture source' }, ...extra,
});
function setup(replies = {}, options = {}) {
  const calls = [], searches = [];
  const service = createDeviceLyricsService({ geniusToken: 'fixture-token', providerTimeoutMs: 1000, ...options,
    serviceFactory: () => ({
      async search(query, provider) { searches.push({ query, provider }); return { results: [original] }; },
      async findLyrics(selection, provider) {
        calls.push(provider);
        let reply = replies[provider] ?? result(provider);
        if (typeof reply === 'function') reply = await reply();
        if (reply instanceof Error) throw reply;
        const lookup = createProviderLookup({
          search: async () => ({ results: [reply.song] }),
          getLyrics: async () => reply,
        });
        return lookup(selection, provider);
      },
    }),
  });
  return { service, calls, searches };
}

test('song search uses Genius exclusively', async () => {
  const { service, searches } = setup();
  assert.deepEqual(await service.searchSongs('Paper Satellites'), [original]);
  assert.deepEqual(searches, [{ query: 'Paper Satellites', provider: 'genius' }]);
});

test('checks all registered providers and preserves credits and selected recording', async () => {
  const { service, calls } = setup();
  const events = [];
  const found = await service.findLyrics(original, { onProgress: check => events.push(check) });
  assert.deepEqual([...calls].sort(), PROVIDERS.map(p => p.id).sort());
  assert.equal(found.sources.length, PROVIDERS.length);
  assert.ok(found.checks.every(c => c.state === 'found'));
  assert.equal(events.filter(c => c.state === 'pending').length, PROVIDERS.length);
  assert.equal(events.filter(c => c.state === 'found').length, PROVIDERS.length);
  assert.equal(found.best.song.provider, 'genius');
  assert.equal(found.best.attribution.name, 'Fixture source');
  assert.equal(found.best.plainLyrics, words);
});

test('deterministic source preference does not depend on completion order', async () => {
  const a = setup({ genius: async () => { await delay(15); return result('genius'); } });
  const b = setup({ lrclib: async () => { await delay(15); return result('lrclib'); } });
  const [first, second] = await Promise.all([a.service.findLyrics(original), b.service.findLyrics(original)]);
  assert.deepEqual(first.sources.map(r => r.song.provider), second.sources.map(r => r.song.provider));
  assert.equal(first.best.song.provider, 'genius');
});

test('a different artist or version is excluded even when it supplies much more text', async () => {
  const mismatched = result('lrclib');
  mismatched.song.artist = 'Another Ensemble';
  mismatched.plainLyrics = (words + '\n').repeat(30);
  const alternate = result('youtubemusic');
  alternate.song.title += ' (Live)';
  const { service } = setup({ lrclib: mismatched, youtubemusic: alternate });
  const found = await service.findLyrics(original);
  assert.equal(found.sources.length, PROVIDERS.length - 2);
  assert.ok(found.checks.filter(c => ['lrclib', 'youtubemusic'].includes(c.provider)).every(c => c.state === 'unavailable'));
});

test('an exact recording wins over a differently released equally formatted result', async () => {
  const different = result('lrclib');
  different.song.album = 'Compilation';
  const found = await setup({ lrclib: different }).service.findLyrics(original);
  assert.equal(found.best.song.provider, 'genius');
  assert.equal(found.sources.find(r => r.song.provider === 'lrclib').match.kind, 'same-song');
});

test('long repeated material does not outrank equally useful shorter lyrics', async () => {
  const verbose = result('lrclib', { plainLyrics: (words + '\n\n').repeat(40) });
  const found = await setup({ lrclib: verbose }).service.findLyrics(original);
  assert.equal(found.best.song.provider, 'genius');
});

test('clear verse formatting improves selection among equally matched recordings', async () => {
  const formatted = result('lrclib', { plainLyrics: '[Verse]\n' + words });
  const found = await setup({ lrclib: formatted }).service.findLyrics(original);
  assert.equal(found.best.song.provider, 'lrclib');
  assert.match(found.best.quality.reason, /verse formatting/);
});

test('unknown Genius duration does not prevent a better formatted matching source from winning', async () => {
  const replies = Object.fromEntries(PROVIDERS.map(p => [p.id, new LyricsError('LYRICS_UNAVAILABLE', 'Missing', 404)]));
  replies.genius = result('genius', { plainLyrics: 'A paper satellite above an empty desk the rain remembers home' });
  replies.lrclib = result('lrclib', { plainLyrics: '[Verse]\n' + words });
  const found = await setup(replies).service.findLyrics({ ...original, duration: null });
  assert.equal(found.best.song.provider, 'lrclib');
  assert.equal(found.best.match.kind, 'same-song');
  assert.match(found.best.quality.reason, /recording may differ/);
});

test('a live-year album cannot masquerade as a studio selection with missing album and duration', async () => {
  const live = result('lrclib', { plainLyrics: '[Verse]\n' + words });
  live.song.album = 'Live 2012';
  const found = await setup({ lrclib: live }).service.findLyrics({ ...original, album: null, duration: null });
  assert.equal(found.checks.find(c => c.provider === 'lrclib').state, 'unavailable');
  assert.ok(found.sources.every(source => source.song.provider !== 'lrclib'));
});

test('short legitimate lyrics are retained and not rejected solely for their length', async () => {
  const found = await setup({ genius: result('genius', { plainLyrics: 'Ash' }) }).service.findLyrics(original);
  assert.equal(found.sources.find(r => r.song.provider === 'genius').plainLyrics, 'Ash');
});

test('unavailable, blocked and timeout outcomes remain distinct while other providers succeed', async () => {
  const found = await setup({
    genius: new LyricsError('ACCESS_DENIED', 'Fixture access denied'),
    lrclib: new LyricsError('LYRICS_UNAVAILABLE', 'No matching lyrics', 404),
    youtubemusic: new LyricsError('TIMEOUT', 'Fixture timed out', 504),
  }).service.findLyrics(original);
  assert.equal(found.sources.length, PROVIDERS.length - 3);
  assert.equal(found.checks.find(c => c.provider === 'genius').state, 'failed');
  assert.equal(found.checks.find(c => c.provider === 'lrclib').state, 'unavailable');
  assert.equal(found.checks.find(c => c.provider === 'youtubemusic').state, 'failed');
  assert.ok(found.best);
});

test('placeholder and empty bodies never become sources', async () => {
  const found = await setup({ genius: result('genius', { plainLyrics: 'No lyrics available' }), lrclib: result('lrclib', { plainLyrics: '' }) }).service.findLyrics(original);
  assert.equal(found.sources.length, PROVIDERS.length - 2);
  assert.ok(found.sources.every(r => !['genius', 'lrclib'].includes(r.song.provider)));
});

test('all unavailable returns null best without treating an outage as an empty match', async () => {
  const replies = Object.fromEntries(PROVIDERS.map(p => [p.id, new LyricsError('LYRICS_UNAVAILABLE', 'Missing', 404)]));
  const found = await setup(replies).service.findLyrics(original);
  assert.equal(found.best, null);
  assert.deepEqual(found.sources, []);
  assert.ok(found.checks.every(c => c.state === 'unavailable'));
});

test('per-provider deadline finishes a partial lookup even if a provider ignores abort', async () => {
  const hung = () => new Promise(() => {});
  const found = await setup({ genius: hung }, { providerTimeoutMs: 15 }).service.findLyrics(original);
  assert.equal(found.sources.length, PROVIDERS.length - 1);
  assert.equal(found.checks[0].state, 'failed');
  assert.match(found.checks[0].message, /too long/);
});

test('aborted discovery stops queued providers and does not publish stale completions', async () => {
  let finish;
  const blocked = new Promise(resolve => { finish = resolve; });
  const { service, calls } = setup(Object.fromEntries(PROVIDERS.map(p => [p.id, async () => { await blocked; return result(p.id); }])));
  const controller = new AbortController();
  const events = [];
  const pending = service.findLyrics(original, { signal: controller.signal, onProgress: c => events.push(c) });
  await delay(0);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  finish();
  await delay(0);
  assert.equal(calls.length, 3);
  assert.equal(events.length, PROVIDERS.length);
  assert.ok(events.every(c => c.state === 'pending'));
});

test('already aborted lookup does no work and emits no progress', async () => {
  const { service, calls } = setup();
  const controller = new AbortController(); controller.abort();
  await assert.rejects(service.findLyrics(original, { signal: controller.signal, onProgress: () => assert.fail('stale callback') }), { name: 'AbortError' });
  assert.deepEqual(calls, []);
});

test('progress objects cannot mutate final provider statuses', async () => {
  const found = await setup().service.findLyrics(original, { onProgress: c => { c.state = 'failed'; } });
  assert.ok(found.checks.every(c => c.state === 'found'));
});

test('a matched chord arrangement wins over higher formatted lyrics and stays paired with its own text', async () => {
  const chart = result('songsterr', { plainLyrics: words, lines: words.split('\n').map(text => ({ text, chords: text ? [{ offset: 0, symbol: 'C/G' }] : [] })) });
  const found = await setup({ songsterr: chart, genius: result('genius', { plainLyrics: '[Verse]\n' + words }) }).service.findLyrics(original);
  assert.equal(found.best.song.provider, 'songsterr');
  assert.deepEqual(found.best.lines, chart.lines);
  assert.match(found.best.quality.reason, /corresponding chords/);
});

test('a versionless chord arrangement needs corroborating lyrics before it can win', async () => {
  const lyric = 'Synthetic morning paper boats\nCross a silver mountain lake\nWe carry twelve blue lanterns\nThrough the valley after rain';
  const selected = { ...original, title: original.title + ' (Acoustic Live)' };
  const chart = result('songsterr', { plainLyrics: lyric, lines: lyric.split('\n').map(text => ({ text, chords: [{ offset: 0, symbol: 'Am' }] })) });
  const reference = result('genius', { song: selected, plainLyrics: lyric + '\n' + lyric });
  const absent = Object.fromEntries(PROVIDERS.map(p => [p.id, new LyricsError('LYRICS_UNAVAILABLE', 'Missing', 404)]));
  const found = await setup({ ...absent, songsterr: chart, genius: reference }).service.findLyrics(selected);
  assert.equal(found.best.song.provider, 'songsterr');
  assert.equal(found.best.match.kind, 'same-song');
  assert.equal(found.best.match.requiresLyricsAgreement, undefined);
  const unverified = await setup({ ...absent, songsterr: chart }).service.findLyrics(selected);
  assert.equal(unverified.best, null);
  assert.equal(unverified.checks.find(c => c.provider === 'songsterr').state, 'unavailable');
});

test('a partial chart cannot outrank complete matching lyrics even with exact title and artist', async () => {
  const lyric = 'Synthetic morning paper boats\nCross a silver mountain lake\nWe carry twelve blue lanterns\nThrough the valley after rain';
  const partial = lyric.split('\n').slice(0, 2).join('\n');
  const chart = result('songsterr', { plainLyrics: partial, lines: partial.split('\n').map(text => ({ text, chords: [{ offset: 0, symbol: 'C' }] })) });
  const absent = Object.fromEntries(PROVIDERS.map(p => [p.id, new LyricsError('LYRICS_UNAVAILABLE', 'Missing', 404)]));
  const found = await setup({ ...absent, songsterr: chart, genius: result('genius', { plainLyrics: lyric }) }).service.findLyrics(original);
  assert.equal(found.best.song.provider, 'genius');
  assert.equal(found.checks.find(check => check.provider === 'songsterr').state, 'unavailable');
});
