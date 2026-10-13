import assert from 'node:assert/strict';
import test from 'node:test';
import { parseUltimateGuitarSearch, parseUltimateGuitarText, parseUltimateGuitarPage, createUltimateGuitarProvider } from '../../src/lyrics/core/ultimate-guitar.js';
import { hasChordArrangement } from '../../src/lyrics/core/arrangements.js';
import { LyricsError } from '../../src/lyrics/core/http.js';

// All music and words below are synthetic fixtures.
const path = '/tab/fixture-ensemble/paper-satellites-chords-81';
const url = 'https://tabs.ultimate-guitar.com' + path;
const tab = overrides => ({ id: 81, song_name: 'Paper Satellites', artist_name: 'Fixture Ensemble',
  type: 'Chords', tab_access_type: 'public', tab_url: url, ...overrides });
const html = (data, canonical = url) => `<link rel="canonical" href="${canonical}"><div class="js-store" data-content="${JSON.stringify({ store: { page: { data } } }).replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"></div>`;
const content = 'Contributor introduction, not part of the song.\n\n[Intro]\n[ch]C[/ch]  [ch]G/B[/ch] (2x)\n\n[Verse 1]\n[tab][ch]C[/ch]       [ch]F#m7[/ch]\nA paper satellite sails[/tab]\n[tab]     [ch]D[/ch]       [ch]G/B[/ch]\nAbove an empty desk at night[/tab]\n\n[Outro]\n[ch]C[/ch]';
const sheet = (overrides = {}) => ({ tab: tab(), tab_view: { wiki_tab: { content }, meta: {}, blocked: false }, ...overrides });

test('Ultimate Guitar searches only public chord arrangements and validates observed URLs', () => {
  const results = parseUltimateGuitarSearch(html({ results: [
    tab(), tab(), tab({ id: 82, type: 'Official' }), tab({ id: 83, tab_access_type: 'private' }),
    tab({ marketing_type: 'official' }), tab({ id: 84 }), tab({ tab_url: 'https://example.com' + path }),
  ] })).results;
  assert.equal(results.length, 1);
  assert.equal(results[0].id, path);
  assert.equal(results[0].title, 'Paper Satellites');
  assert.equal(results[0].artist, 'Fixture Ensemble');
  assert.equal(results[0].hasLyrics, null);
});

test('chord rows pair with their own lyric lines while intro and outro chords survive', () => {
  const result = parseUltimateGuitarText(content);
  assert.equal(result.lines[0].text, '[Intro]');
  assert.equal(result.plainLyrics.includes('Contributor introduction'), false);
  const first = result.lines.find(line => line.text.startsWith('A paper satellite'));
  const second = result.lines.find(line => line.text.startsWith('Above an empty'));
  assert.deepEqual(first.chords, [{ offset: 0, symbol: 'C' }, { offset: 8, symbol: 'F#m7' }]);
  assert.deepEqual(second.chords, [{ offset: 5, symbol: 'D' }, { offset: 13, symbol: 'G/B' }]);
  assert.equal(result.lines[1].chords[1].symbol, 'G/B');
  assert.equal(result.lines.at(-1).chords[0].symbol, 'C');
  assert.ok(hasChordArrangement(result));
  assert.equal(result.plainLyrics.includes('[ch]'), false);
  assert.equal(result.plainLyrics.includes('[tab]'), false);
});

test('long turnaround chord columns remain separate anchors after short lyric lines', () => {
  const result = parseUltimateGuitarText('[Verse]\n[ch]C[/ch]                              [ch]G/B[/ch]\nA paper satellite\n[ch]D[/ch]\nAbove an empty desk at night');
  assert.equal(result.lines[1].text.length, 31);
  assert.deepEqual(result.lines[1].chords[1], { offset: 31, symbol: 'G/B' });
  assert.ok(hasChordArrangement(result));
});

test('inline chord tags retain word offsets without adding chord symbols to lyric text', () => {
  const result = parseUltimateGuitarText('[Verse]\nA [ch]C[/ch]paper satellite sails\nAbove [ch]F#m[/ch]an empty desk at night');
  assert.equal(result.lines[1].text, 'A paper satellite sails');
  assert.deepEqual(result.lines[1].chords, [{ offset: 2, symbol: 'C' }]);
  assert.deepEqual(result.lines[2].chords, [{ offset: 6, symbol: 'F#m' }]);
});

test('tagged lyric blocks preserve words beginning with instruction-like verbs', () => {
  const result = parseUltimateGuitarText('[Verse]\n[tab][ch]C6/9[/ch]\nPlay a paper satellite song[/tab]\n[tab][ch]G/B[/ch]\nEnd the evening by the desk[/tab]');
  assert.equal(result.lines[1].text, 'Play a paper satellite song');
  assert.deepEqual(result.lines[1].chords, [{ offset: 0, symbol: 'C6/9' }]);
  assert.equal(result.lines[2].text, 'End the evening by the desk');
  assert.equal(result.lines[2].chords[0].symbol, 'G/B');
});

test('metadata comes from explicit chart fields, never from strumming exercise tempo', () => {
  const data = sheet({ tab: tab({ username: 'Fixture Arranger', tonality_name: 'Ab',
    album_cover: { web_album_cover: { small: 'https://www.ultimate-guitar.com/fixture.jpg' } },
    recording: { is_acoustic: 1, video_urls: ['https://www.youtube.com/watch?v=Fixture_001'] },
  }), tab_view: { wiki_tab: { content }, meta: { capo: 1, tuning: { value: 'E A D G B E' }, difficulty: 'novice' },
    ug_difficulty: 'intermediate', strummings: [{ bpm: 64, part: 'Main pattern' }], song_genre: 'Pop' } });
  const result = parseUltimateGuitarPage(html(data), path);
  assert.ok(hasChordArrangement(result));
  assert.equal(result.song.metadata.key, 'Ab');
  assert.equal(result.song.metadata.capo, 1);
  assert.deepEqual(result.song.metadata.tuning, ['E', 'A', 'D', 'G', 'B', 'E']);
  assert.equal(result.song.metadata.tempo, undefined);
  assert.equal(result.song.metadata.difficulty, 'intermediate');
  assert.equal(result.song.metadata.recording, 'Acoustic');
  assert.equal(result.song.metadata.artworkUrl, 'https://www.ultimate-guitar.com/fixture.jpg');
  assert.deepEqual(result.song.metadata.credits, [{ role: 'Transcriber', name: 'Fixture Arranger' }]);
  assert.equal(result.song.metadata.mediaLinks.length, 2);
});

test('wrong selected IDs, source destinations and canonical pages cannot substitute another song', () => {
  for (const data of [sheet({ tab: tab({ id: 99 }) }), sheet({ tab: tab({ tab_url: 'https://example.com' + path }) })]) {
    assert.throws(() => parseUltimateGuitarPage(html(data), path), { code: 'INVALID_RESPONSE' });
  }
  assert.throws(() => parseUltimateGuitarPage(html(sheet(), url.replace('-81', '-99')), path), { code: 'INVALID_RESPONSE' });
});

test('explicit preamble facts fill missing fields without guessing or replacing structured values', () => {
  const preamble = 'Capo: 2nd fret\nKey: F#m\nTuning: Standard (E A D G B E)\nTempo: 87.5 BPM\nTime signature: 6/8\n';
  const result = parseUltimateGuitarPage(html(sheet({ tab_view: { meta: { capo: 1, tonality: 'Ab' },
    wiki_tab: { content: preamble + content } } })), path);
  assert.equal(result.song.metadata.capo, 1);
  assert.equal(result.song.metadata.key, 'Ab');
  assert.deepEqual(result.song.metadata.tuning, ['E', 'A', 'D', 'G', 'B', 'E']);
  assert.equal(result.song.metadata.tempo, 87.5);
  assert.equal(result.song.metadata.timeSignature, '6/8');
  const zero = parseUltimateGuitarPage(html(sheet({ tab_view: { meta: {},
    wiki_tab: { content: 'No capo\nKey: C\n' + content } } })), path);
  assert.equal(zero.song.metadata.capo, 0);
  assert.equal(zero.song.metadata.key, 'C');
});

test('conflicting, ambiguous and in-song directive text does not become metadata', () => {
  const preamble = 'Capo: 2nd fret\nCapo: 4th fret\nTuning: Standard\nTempo: as fast as possible\nTime signature: 3/7\n';
  const result = parseUltimateGuitarPage(html(sheet({ tab_view: { meta: {},
    wiki_tab: { content: preamble + content + '\nCapo: 5th fret\nKey: G' } } })), path);
  for (const key of ['capo', 'key', 'tuning', 'tempo', 'timeSignature']) assert.equal(result.song.metadata[key], undefined);
});

test('paid, blocked, instrumental-only and malformed chart content never becomes lyrics', () => {
  for (const data of [sheet({ tab: tab({ type: 'Official' }) }), sheet({ tab: tab({ tab_access_type: 'private' }) }),
    sheet({ tab_view: { blocked: true, wiki_tab: { content } } })]) {
    assert.throws(() => parseUltimateGuitarPage(html(data), path), { code: 'LYRICS_UNAVAILABLE' });
  }
  for (const value of ['[Intro]\n[ch]C[/ch] [ch]G[/ch]\n[Outro]\n[ch]F[/ch]', '[Verse]\nA paper satellite\nAbove an empty desk']) {
    assert.throws(() => parseUltimateGuitarText(value), { code: 'LYRICS_UNAVAILABLE' });
  }
  for (const value of ['[ch]BAD[/ch]\nA paper satellite', '[ch]C\nA paper satellite', 'x'.repeat(200001)]) {
    assert.throws(() => parseUltimateGuitarText(value), { code: 'INVALID_RESPONSE' });
  }
  assert.throws(() => parseUltimateGuitarSearch('<html>Unrecognized page</html>'), { code: 'INVALID_RESPONSE' });
});

test('invalid selections never request arbitrary URLs and source denials stop immediately', async () => {
  const requests = [];
  const provider = createUltimateGuitarProvider({ http: { async request(url) { requests.push(url); throw new LyricsError('ACCESS_DENIED', 'Denied'); } } });
  for (const id of [url, '/tab/x/y-official-81', '/tab/x/y-chords-81?secret=1', '../../private', path.replace('fixture', 'fixture%2f')]) {
    await assert.rejects(provider.getLyrics(id), { code: 'INVALID_ID' });
  }
  assert.equal(requests.length, 0);
  await assert.rejects(provider.getLyrics(path), { code: 'ACCESS_DENIED' });
  assert.deepEqual(requests, [url]);
});
