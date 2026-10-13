import assert from 'node:assert/strict';
import test from 'node:test';
import { createProviderLookup } from '../../src/lyrics/core/provider-lookup.js';
import { LyricsError } from '../../src/lyrics/core/http.js';

// Invented song and lyrics used solely to exercise matching and failure handling.
const selection = { id: 'original', provider: 'genius', title: 'Paper Satellites', artist: 'Fixture Ensemble', album: 'Test Record', duration: 123 };
const song = (id = '1', extra = {}) => ({ ...selection, id, provider: 'lrclib', instrumental: false, hasLyrics: null, ...extra });
const lyrics = value => ({ song: value, plainLyrics: 'A paper satellite\nAbove an empty desk', syncedLyrics: null, attribution: { name: 'Fixture source' } });
const code = expected => error => { assert.equal(error.code, expected); return true; };
function setup(results, replies = {}) {
  const calls = { search: [], lyrics: [] };
  const findLyrics = createProviderLookup({
    async search(...args) { calls.search.push(args); if (results instanceof Error) throw results; return { results }; },
    async getLyrics(provider, id) {
      calls.lyrics.push({ provider, id });
      const reply = replies[id] ?? lyrics(results.find(value => value.id === id));
      if (reply instanceof Error) throw reply;
      return reply;
    },
  });
  return { findLyrics, calls };
}

test('searches the chosen provider and prefers matching album/duration over a compilation', async () => {
  const { findLyrics, calls } = setup([song('1', { album: 'Compilation', hasLyrics: true }), song('2')]);
  const result = await findLyrics(selection, 'lrclib');
  assert.deepEqual(calls.search, [['Paper Satellites Fixture Ensemble', 'lrclib', { verifyLyrics: false }]]);
  assert.deepEqual(calls.lyrics, [{ provider: 'lrclib', id: '2' }]);
  assert.equal(result.song.id, '2');
  assert.equal(result.song.hasLyrics, true);
  assert.equal(result.attribution.name, 'Fixture source');
  assert.deepEqual(result.match, { kind: 'same-recording' });
});

test('keeps actual release metadata when only the same song on another release is available', async () => {
  const { findLyrics } = setup([song('1', { album: 'Another Release' })]);
  const result = await findLyrics(selection, 'lrclib');
  assert.equal(result.song.album, 'Another Release');
  assert.equal(result.match.kind, 'same-song');
});

test('safely matches punctuation/case and a trailing remaster without stripping version words', async () => {
  const { findLyrics, calls } = setup([
    song('1', { title: 'Paper Satellites (Acoustic) - 2020 Remaster' }),
    song('2', { title: 'PAPER-SATELLITES (2020 Remaster)' }),
  ]);
  assert.equal((await findLyrics(selection, 'lrclib')).song.id, '2');
  assert.deepEqual(calls.lyrics.map(call => call.id), ['2']);
});

test('rejects covers, changed track versions, live albums and substantially different durations', async () => {
  const { findLyrics, calls } = setup([
    song('1', { artist: 'Cover Ensemble' }),
    ...['Live', 'Acoustic', 'Karaoke', 'Sped Up', 'Slowed', 'Instrumental', 'Radio Edit'].map((version, index) => song(String(index + 2), { title: `Paper Satellites (${version})` })),
    song('10', { album: 'Live at the Test Hall' }),
    song('11', { duration: 147 }),
  ]);
  await assert.rejects(findLyrics(selection, 'lrclib'), code('LYRICS_UNAVAILABLE'));
  assert.deepEqual(calls.lyrics, []);
});

test('an explicitly selected live version can match only that version', async () => {
  const live = { ...selection, title: 'Paper Satellites (Live)', album: 'Live at the Test Hall' };
  const { findLyrics, calls } = setup([
    song('1'),
    song('2', { title: live.title, album: live.album }),
  ]);
  assert.equal((await findLyrics(live, 'lrclib')).song.id, '2');
  assert.deepEqual(calls.lyrics.map(call => call.id), ['2']);
});

test('album versions after spaced hyphens or dashes cannot match a studio recording', async () => {
  const versions = ['Live', 'Acoustic', 'Unplugged', 'Karaoke', 'Instrumental', 'Sped Up', 'Slowed', 'Nightcore'];
  const albums = ['-', '\u2013', '\u2014'].flatMap(separator => versions.map(version => `Test Record ${separator} ${version}`));
  const { findLyrics, calls } = setup(albums.map((album, index) => song(String(index), { album })));
  await assert.rejects(findLyrics(selection, 'lrclib'), code('LYRICS_UNAVAILABLE'));
  assert.deepEqual(calls.lyrics, []);
});

test('an album title beginning with Live does not imply a live recording without a descriptor', async () => {
  const { findLyrics } = setup([song('1', { album: 'Live Through This' })]);
  const result = await findLyrics(selection, 'lrclib');
  assert.equal(result.song.album, 'Live Through This');
  assert.equal(result.match.kind, 'same-song');
});

test('bracketed and dash-separated album descriptors identify the same version', async () => {
  const { findLyrics } = setup([song('1', { album: 'Test Record (Acoustic)' })]);
  const result = await findLyrics({ ...selection, album: 'Test Record \u2014 Acoustic' }, 'lrclib');
  assert.equal(result.song.id, '1');
});

test('uses an exact selection on its own provider without a catalog search', async () => {
  const selected = song('selected');
  const { findLyrics, calls } = setup([], { selected: lyrics(selected) });
  const result = await findLyrics(selected, 'lrclib');
  assert.equal(result.match.kind, 'same-recording');
  assert.deepEqual(calls.search, []);
  assert.deepEqual(calls.lyrics, [{ provider: 'lrclib', id: 'selected' }]);
});

test('the same provider record may supply album details omitted by search', async () => {
  for (const [selectedAlbum, returnedAlbum] of [[null, 'Unplugged'], ['Unplugged', null]]) {
    const selected = song('selected', { title: 'Paper Satellites (Acoustic Live)', album: selectedAlbum });
    const { findLyrics, calls } = setup([], { selected: lyrics({ ...selected, album: returnedAlbum }) });
    const result = await findLyrics(selected, 'lrclib');
    assert.equal(result.song.album, returnedAlbum);
    assert.equal(result.match.kind, 'same-recording');
    assert.deepEqual(calls.search, []);
    assert.deepEqual(calls.lyrics, [{ provider: 'lrclib', id: 'selected' }]);
  }
});

test('album enrichment cannot bypass changed identity or version checks', async t => {
  const selected = song('selected', { title: 'Paper Satellites (Acoustic Live)', album: null });
  const changes = [
    { id: 'different' }, { provider: 'genius' }, { title: 'Another Song (Acoustic Live)' },
    { title: 'Paper Satellites' }, { artist: 'Different Ensemble' }, { duration: 300 },
  ];
  for (const change of changes) {
    await t.test(JSON.stringify(change), async () => {
      const { findLyrics, calls } = setup([], { selected: lyrics({ ...selected, album: 'Unplugged', ...change }) });
      await assert.rejects(findLyrics(selected, 'lrclib'), code('INVALID_RESPONSE'));
      assert.deepEqual(calls.search, []);
    });
  }
});

test('the same provider ID still cannot override conflicting known album versions', async () => {
  const selected = song('selected');
  const { findLyrics } = setup([], { selected: lyrics({ ...selected, album: 'Unplugged' }) });
  await assert.rejects(findLyrics(selected, 'lrclib'), code('INVALID_RESPONSE'));
});

test('missing album data is not an identity match across providers or without a selected ID', async () => {
  for (const selected of [
    { ...selection, album: null, duration: null },
    { ...selection, provider: 'lrclib', id: null, album: null, duration: null },
  ]) {
    // Even coincidentally equal IDs from different providers are not identity.
    const { findLyrics, calls } = setup([song(selection.id, { album: 'Live 2012', duration: null })]);
    await assert.rejects(findLyrics(selected, 'lrclib'), code('LYRICS_UNAVAILABLE'));
    assert.deepEqual(calls.lyrics, []);
  }
});

test('explicit acoustic live title matches corresponding album versions when search omitted the album', async () => {
  const selected = { ...selection, title: 'Paper Satellites (Acoustic Live)', album: null, duration: null };
  for (const album of ['Unplugged (Live)', 'Unplugged (Deluxe Edition) (Live)']) {
    const candidate = song('1', { title: selected.title, album, duration: null });
    const { findLyrics, calls } = setup([candidate]);
    const result = await findLyrics(selected, 'lrclib');
    assert.equal(result.song.album, album);
    assert.equal(result.match.kind, 'same-song');
    assert.deepEqual(calls.lyrics, [{ provider: 'lrclib', id: '1' }]);
  }
});

test('title version evidence cannot admit incompatible albums, artists or lyricless recordings', async t => {
  const selected = { ...selection, title: 'Paper Satellites (Acoustic Live)', album: null, duration: null };
  const candidate = song('1', { title: selected.title, album: 'Unplugged (Live)', duration: null });
  const cases = [
    ['plain title has no version evidence', { title: 'Paper Satellites' }, { title: 'Paper Satellites' }],
    ['ordinary title words are not version descriptors', { title: 'Live Acoustic Satellites' }, { title: 'Live Acoustic Satellites' }],
    ['a parenthetical subtitle is not a version descriptor', { title: 'Paper Satellites (Live Forever)' }, { title: 'Paper Satellites (Live Forever)', album: 'Live 2012' }],
    ['acoustic title does not imply live', { title: 'Paper Satellites (Acoustic)' }, { title: 'Paper Satellites (Acoustic)' }],
    ['live title does not imply acoustic', { title: 'Paper Satellites (Live)' }, { title: 'Paper Satellites (Live)' }],
    ['a cover has a different artist', {}, { artist: 'Different Ensemble' }],
    ['a different title remains different', {}, { title: 'Another Song (Acoustic Live)' }],
    ['a changed title version remains different', {}, { title: 'Paper Satellites (Live)' }],
    ['instrumental metadata excludes lyrics', {}, { instrumental: true }],
    ['an instrumental album has unsupported version evidence', {}, { album: 'Unplugged (Live) (Instrumental)' }],
  ];
  for (const [name, selectedChange, candidateChange] of cases) {
    await t.test(name, async () => {
      const { findLyrics, calls } = setup([{ ...candidate, ...candidateChange }]);
      await assert.rejects(findLyrics({ ...selected, ...selectedChange }, 'lrclib'), code('LYRICS_UNAVAILABLE'));
      assert.deepEqual(calls.lyrics, []);
    });
  }
});

test('known lyricless and instrumental catalog entries never become provider tabs', async () => {
  const { findLyrics, calls } = setup([
    song('1', { hasLyrics: false }), song('2', { instrumental: true }), song('3', { hasLyrics: true }),
  ]);
  assert.equal((await findLyrics(selection, 'lrclib')).song.id, '3');
  assert.deepEqual(calls.lyrics.map(call => call.id), ['3']);
});

test('an explicitly instrumental selection cannot be replaced with a vocal recording', async () => {
  const { findLyrics, calls } = setup([song('1', { hasLyrics: true })]);
  await assert.rejects(findLyrics({ ...selection, instrumental: true }, 'lrclib'), code('LYRICS_UNAVAILABLE'));
  assert.deepEqual(calls, { search: [], lyrics: [] });
});

test('tries another matching candidate after missing extraction, then verifies its actual text', async () => {
  const { findLyrics, calls } = setup([song('1'), song('2'), song('3')], {
    1: new LyricsError('EXTRACTION_FAILED', 'No lyric container.'),
    2: { song: song('2'), plainLyrics: '  ', syncedLyrics: '[ar:Fixture Ensemble]\n[00:01.00]' },
  });
  assert.equal((await findLyrics(selection, 'lrclib')).song.id, '3');
  assert.deepEqual(calls.lyrics.map(call => call.id), ['1', '2', '3']);
});

test('empty text and instrumentals cannot claim availability even if search promised lyrics', async () => {
  const { findLyrics } = setup([song('1', { hasLyrics: true }), song('2', { hasLyrics: true })], {
    1: { song: song('1', { hasLyrics: true }), plainLyrics: '', syncedLyrics: null },
    2: { song: song('2', { instrumental: true }), plainLyrics: 'Instrumental', syncedLyrics: null },
  });
  await assert.rejects(findLyrics(selection, 'lrclib'), error => {
    assert.equal(error.code, 'LYRICS_UNAVAILABLE');
    assert.equal(error.status, 404);
    return true;
  });
});

test('standalone instrumental or missing-lyrics placeholders cannot become verified lyrics', async t => {
  for (const placeholder of ['[Instrumental]', '(Instrumental)', 'Instrumental', 'No lyrics available', 'Lyrics not available for this song.']) {
    await t.test(placeholder, async () => {
      for (const fields of [
        { plainLyrics: placeholder, syncedLyrics: null },
        { plainLyrics: null, syncedLyrics: `[ar:Fixture Ensemble]\n[00:01.00]${placeholder}` },
      ]) {
        const { findLyrics } = setup([song('1')], { 1: { song: song('1'), ...fields } });
        await assert.rejects(findLyrics(selection, 'lrclib'), code('LYRICS_UNAVAILABLE'));
      }
    });
  }
});

test('preserves an unresolved extraction failure rather than claiming definite lyric absence', async () => {
  const error = new LyricsError('EXTRACTION_FAILED', 'No recognizable lyrics container.');
  const { findLyrics, calls } = setup([song('1'), song('2')], {
    1: error,
    2: new LyricsError('LYRICS_UNAVAILABLE', 'No lyrics.', 404),
  });
  await assert.rejects(findLyrics(selection, 'lrclib'), value => value === error);
  assert.deepEqual(calls.lyrics.map(call => call.id), ['1', '2']);
  const exact = setup(new LyricsError('NOT_FOUND', 'No catalog match.', 404), { selected: error });
  await assert.rejects(exact.findLyrics(song('selected'), 'lrclib'), value => value === error);
});

test('sync-only lyrics need actual lyric text rather than LRC metadata or timestamps', async () => {
  const { findLyrics } = setup([song('1')], {
    1: { song: song('1'), plainLyrics: null, syncedLyrics: '[ar:Fixture Ensemble]\n[00:01.00]A paper satellite' },
  });
  assert.equal((await findLyrics(selection, 'lrclib')).song.id, '1');
});

test('bounds fetches to three unique candidates, including the original selection', async () => {
  const candidates = [song('selected'), song('2'), song('2'), song('3'), song('4')];
  const replies = Object.fromEntries(candidates.map(candidate => [candidate.id, new LyricsError('NOT_FOUND', 'Missing.', 404)]));
  const { findLyrics, calls } = setup(candidates, replies);
  await assert.rejects(findLyrics(song('selected'), 'lrclib'), code('LYRICS_UNAVAILABLE'));
  assert.deepEqual(calls.lyrics.map(call => call.id), ['selected', '2', '3']);
});

test('rate limits, denial, network failures, malformed data and timeouts stop that provider immediately', async t => {
  for (const errorCode of ['RATE_LIMITED', 'ACCESS_DENIED', 'NETWORK_ERROR', 'TIMEOUT', 'INVALID_RESPONSE', 'UPSTREAM_ERROR']) {
    await t.test(errorCode, async () => {
      const error = new LyricsError(errorCode, 'Provider failure.', errorCode === 'RATE_LIMITED' ? 429 : 502, 60);
      const { findLyrics, calls } = setup([song('1'), song('2')], { 1: error });
      await assert.rejects(findLyrics(selection, 'lrclib'), value => value === error);
      assert.deepEqual(calls.lyrics.map(call => call.id), ['1']);
    });
  }
});

test('a failed exact selection does not trigger a catalog retry after an access error', async () => {
  const error = new LyricsError('ACCESS_DENIED', 'Denied.');
  const { findLyrics, calls } = setup([song('2')], { selected: error });
  await assert.rejects(findLyrics(song('selected'), 'lrclib'), value => value === error);
  assert.deepEqual(calls.search, []);
});

test('search misses report unavailable while search failures preserve their real cause', async () => {
  await assert.rejects(setup([]).findLyrics(selection, 'lrclib'), code('LYRICS_UNAVAILABLE'));
  await assert.rejects(setup(new LyricsError('NOT_FOUND', 'Missing.', 404)).findLyrics(selection, 'lrclib'), code('LYRICS_UNAVAILABLE'));
  const error = new LyricsError('RATE_LIMITED', 'Busy.', 429, 60);
  await assert.rejects(setup(error).findLyrics(selection, 'lrclib'), value => value === error);
});

test('does not publish lyrics with a changed returned ID, provider, title, artist or duration', async t => {
  for (const change of [{ id: 'different' }, { provider: 'genius' }, { title: 'A Different Song' }, { artist: 'Different Ensemble' }, { duration: 300 }]) {
    await t.test(JSON.stringify(change), async () => {
      const { findLyrics, calls } = setup([song('1'), song('2')], { 1: lyrics(song('1', change)) });
      await assert.rejects(findLyrics(selection, 'lrclib'), code('INVALID_RESPONSE'));
      assert.deepEqual(calls.lyrics.map(call => call.id), ['1']);
    });
  }
});

test('rejects invalid catalog metadata and foreign-provider search entries', async () => {
  await assert.rejects(setup([song('1', { provider: 'genius' })]).findLyrics(selection, 'lrclib'), code('INVALID_RESPONSE'));
  await assert.rejects(setup([song('1', { title: null })]).findLyrics(selection, 'lrclib'), code('INVALID_RESPONSE'));
});

test('validates bounded user metadata before making any provider request', async () => {
  const { findLyrics, calls } = setup([]);
  for (const value of [null, {}, { ...selection, title: ' ' }, { ...selection, title: 'x'.repeat(301) },
    { ...selection, artist: 'Name\nOther' }, { ...selection, album: 'a'.repeat(301) },
    { ...selection, duration: -1 }, { ...selection, duration: '123' }, { ...selection, id: 'x'.repeat(8193) }]) {
    await assert.rejects(findLyrics(value, 'lrclib'), code('INVALID_SELECTION'));
  }
  assert.deepEqual(calls, { search: [], lyrics: [] });
});

test('long valid metadata produces a bounded query containing both title and artist', async () => {
  const { findLyrics, calls } = setup([]);
  await assert.rejects(findLyrics({ title: 'Title '.repeat(40).trim(), artist: 'Artist '.repeat(40).trim() }, 'lrclib'), code('LYRICS_UNAVAILABLE'));
  const [query] = calls.search[0];
  assert.ok(query.length <= 200);
  assert.match(query, /^Title /);
  assert.match(query, /Artist /);
});
