import test from 'node:test';
import assert from 'node:assert/strict';
import { createSongsterrProvider, parseSongsterrPage, parseSongsterrSearch } from '../../src/lyrics/core/songsterr.js';

const id = '/a/wsa/example-artist-original-song-chords-s123';
const chord = (root, suffix = '', bass = root) => ({ type: 'chord', chord: { baseNote: { name: root }, firstNote: { name: bass }, chordType: { suffix } } });
const text = value => ({ type: 'text', text: value });
const noise = value => ({ type: 'noise', text: value });
const line = (...pieces) => ({ type: 'line', line: pieces });
const content = [line(chord('C'), text('Our invented verse beneath the stars')), line(text('A second invented line for this test'), chord('G', '7', 'B'))];
const stateFor = (rows = content, overrides = {}) => ({
  chords: { current: { songId: 123, artist: 'Example Artist', title: 'Original Song' } },
  chordpro: { current: rows }, ...overrides,
});
const htmlFor = (state, canonical = `https://www.songsterr.com${id}`) => `<html><link rel="canonical" href="${canonical}"><script id="state" type="application/json">${JSON.stringify(state)}</script></html>`;

test('Songsterr search takes title and artist from structured results and only observed chart routes', () => {
  const entries = [
    { songId: 123, title: 'Original Song', artist: 'Example Artist', hasChords: true },
    { songId: 124, title: 'Tabs only', artist: 'Example Artist', hasChords: false },
    { songId: 125, title: 'No observed route', artist: 'Example Artist', hasChords: true },
    { songId: 126, title: 'Wrong host', artist: 'Example Artist', hasChords: true },
    { songId: 127, title: 'Junk', artist: 'Example Artist', hasChords: true, isJunk: true },
  ];
  const html = htmlFor({ songs: { songs: { list: entries } } }) +
    `<a href="${id.replace('-chords-', '-tab-')}">Untrusted combined label</a>` +
    '<a href="/a/wsa/tabs-only-tab-s124">Tab</a><a href="https://example.com/a/wsa/wrong-chords-s126">Wrong</a>' +
    '<a href="/a/wsa/junk-chords-s127">Junk</a>';
  const { results } = parseSongsterrSearch(html);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, id);
  assert.equal(results[0].url, `https://www.songsterr.com${id}`);
  assert.equal(results[0].title, 'Original Song');
  assert.equal(results[0].hasLyrics, null);
});

test('Songsterr keeps source alignment including UTF16 offsets, section and chord-only rows', () => {
  const rows = [
    { type: 'section', text: 'Intro' }, line(chord('C'), noise('   '), chord('F')),
    { type: 'section', text: 'Verse' },
    { ...line(text('🌟 Our '), chord('C', 'maj7'), text('invented first line')), blocks: [{ duplicate: 'must not be parsed' }] },
    line(text('A second invented verse'), chord('G', '7', 'B')),
  ];
  const result = parseSongsterrPage(htmlFor(stateFor(rows)), id);
  assert.equal(result.lines.length, 5);
  assert.deepEqual(result.lines[1], { text: '   ', chords: [{ offset: 0, symbol: 'C' }, { offset: 3, symbol: 'F' }] });
  assert.deepEqual(result.lines[3].chords, [{ offset: 7, symbol: 'Cmaj7' }]);
  assert.deepEqual(result.lines[4].chords, [{ offset: 23, symbol: 'G7/B' }]);
  assert.equal(result.lines[0].text, '[Intro]');
  assert.equal(result.plainLyrics, result.lines.map(value => value.text).join('\n').trim());
});

test('Songsterr combines split slash chords and alterations while preserving repeat directions', () => {
  const rows = [line(chord('E', 'm6'), noise('/'), chord('A#'), noise('  '), chord('A', 'm6'), noise('-9  x4')), ...content];
  const result = parseSongsterrPage(htmlFor(stateFor(rows)), id);
  assert.deepEqual(result.lines[0], { text: '    x4', chords: [{ offset: 0, symbol: 'Em6/A#' }, { offset: 2, symbol: 'Am6-9' }] });
  assert.equal(rows[0].line[5].text, '-9  x4', 'parser does not mutate the input state');
});

test('Songsterr reads explicit chart metadata and same-song media, not tab settings or UI defaults', () => {
  const rows = [{ type: 'capo', text: '2' }, { type: 'tuning', text: 'Drop D (DADGBE)' }, { type: 'key', text: 'Em' }, { type: 'tempo', text: '92 bpm' }, { type: 'time', text: '6/8' }, ...content];
  const state = stateFor(rows, {
    chordsCapo: { fret: 7, fromChordpro: false },
    meta: { current: { songId: 123, tracks: [{ tuning: [1, 2, 3], difficulty: 9 }], videos: [
      { status: 'done', videoId: 'abcdefghijk', feature: 'backing' }, { status: 'pending', videoId: '12345678901' },
      { status: 'done', videoId: 'evil?token=x' }, { status: 'done', videoId: 'abcdefghijk' },
    ] } },
  });
  const { metadata } = parseSongsterrPage(htmlFor(state), id).song;
  assert.equal(metadata.capo, 2);
  assert.deepEqual(metadata.tuning, ['D', 'A', 'D', 'G', 'B', 'E']);
  assert.equal(metadata.key, 'Em');
  assert.equal(metadata.tempo, 92);
  assert.equal(metadata.timeSignature, '6/8');
  assert.equal(metadata.difficulty, undefined);
  assert.equal(metadata.mediaLinks.length, 2);
  assert.equal(metadata.mediaLinks[1].url, 'https://www.youtube.com/watch?v=abcdefghijk');
  const noDirectives = parseSongsterrPage(htmlFor(stateFor(content, { chordsCapo: { fret: 7, fromChordpro: false } })), id);
  assert.equal(noDirectives.song.metadata.capo, undefined);
  const wrongSongMeta = stateFor(content, { meta: { current: { songId: 999, videos: [{ status: 'done', videoId: 'abcdefghijk' }] } } });
  assert.equal(parseSongsterrPage(htmlFor(wrongSongMeta), id).song.metadata.mediaLinks.length, 1);
});

test('Songsterr rejects a different song, malformed page or unknown arrangement content', () => {
  assert.throws(() => parseSongsterrPage('<html>Challenge</html>', id), { code: 'INVALID_RESPONSE' });
  assert.throws(() => parseSongsterrPage(htmlFor(stateFor(content, { chords: { current: { songId: 999 } } })), id), { code: 'INVALID_RESPONSE' });
  assert.throws(() => parseSongsterrPage(htmlFor(stateFor(), 'https://example.com/chart-s123'), id), { code: 'INVALID_RESPONSE' });
  assert.throws(() => parseSongsterrPage(htmlFor(stateFor([...content, { type: 'unknown-content', text: 'May be missing lyrics' }])), id), { code: 'INVALID_RESPONSE' });
  assert.throws(() => parseSongsterrPage(htmlFor(stateFor([...content, line({ type: 'unsupported' })])), id), { code: 'INVALID_RESPONSE' });
});

test('Songsterr does not report pure tabs/chords, notes or lyric-only pages as lyrics with chords', () => {
  for (const rows of [[], [line(chord('C'), noise('  x4')), line(chord('G'), noise(' X32010'))], [line(text('An invented line of lyrics with no music')), line(text('Another invented line of lyrics'))]]) {
    assert.throws(() => parseSongsterrPage(htmlFor(stateFor(rows)), id), { code: 'LYRICS_UNAVAILABLE' });
  }
});

test('Songsterr selected IDs cannot select arbitrary URLs or malformed numeric IDs', async () => {
  const provider = createSongsterrProvider({ http: { request() { assert.fail('invalid IDs must not issue a request'); } } });
  for (const selected of ['123', `https://www.songsterr.com${id}`, `${id}?token=1`, id.replace('s123', 's0'), '/a/wsa/%2f-chords-s123', '//example.com/chart-chords-s123']) {
    await assert.rejects(provider.getLyrics(selected), { code: 'INVALID_ID' });
  }
});

test('Songsterr uses the injected cancellable native HTTP transport without adding credentials', async () => {
  const calls = [], controller = new AbortController();
  const provider = createSongsterrProvider({ http: { async request(url, options) { calls.push({ url, options }); return htmlFor(stateFor()); } } });
  await provider.getLyrics(id, { signal: controller.signal });
  assert.deepEqual(calls, [{ url: `https://www.songsterr.com${id}`, options: { json: false, signal: controller.signal } }]);
});
