import assert from 'node:assert/strict';
import test from 'node:test';
import { createLyricsService } from '../../src/lyrics/core/lyrics.js';
import { sanitizeMetadata, geniusMetadata, deezerHttpsUrl, thumbnailUrl } from '../../src/lyrics/core/metadata.js';

const fakeHttp = (...responses) => ({ async request() {
  assert.ok(responses.length, 'Unexpected request');
  return responses.shift();
} });
const fixture = { id: 81, title: 'Paper Satellites', primary_artist: { name: 'Fixture Ensemble' },
  url: 'https://genius.com/Fixture-ensemble-paper-satellites-lyrics' };
const words = 'A paper satellite\nAbove an empty desk';

test('Genius metadata preserves album art, release facts, media and performance credits', async () => {
  const record = { ...fixture, album: { name: 'Test Record', cover_art_url: 'https://images.genius.com/album.jpg' },
    song_art_image_url: 'https://images.genius.com/song.jpg', release_date: '2020-02-29', language: 'en',
    primary_artists: [{ name: 'Fixture Ensemble' }], writer_artists: [{ name: 'Paper Writer' }],
    producer_artists: [{ name: 'Desk Producer' }], featured_artists: [{ name: 'Featured Fixture' }],
    custom_performances: [{ label: 'Keyboards', artists: [{ name: 'Ivory Fixture' }] }],
    media: [{ provider: 'youtube', type: 'video', url: 'https://www.youtube.com/watch?v=Fixture_001' }],
    apple_music_player_url: 'https://genius.com/songs/81/apple_music_player',
  };
  const result = await createLyricsService({ geniusToken: 'fixture', http: fakeHttp({ response: { song: record } },
    `<div data-lyrics-container="true">${words.replaceAll('\n', '<br>')}</div>`) }).getLyrics('genius', '81');
  assert.deepEqual(result.song.metadata, {
    album: 'Test Record', language: 'en', artworkUrl: 'https://images.genius.com/album.jpg',
    releaseDate: '2020-02-29', year: 2020,
    mediaLinks: [{ kind: 'video', label: 'youtube', url: 'https://www.youtube.com/watch?v=Fixture_001' },
      { kind: 'audio', label: 'Apple Music', url: 'https://genius.com/songs/81/apple_music_player' }],
    credits: [{ role: 'Artist', name: 'Fixture Ensemble' }, { role: 'Featured artist', name: 'Featured Fixture' },
      { role: 'Writer', name: 'Paper Writer' }, { role: 'Producer', name: 'Desk Producer' },
      { role: 'Keyboards', name: 'Ivory Fixture' }],
  });
  assert.equal(result.plainLyrics, words);
  assert.equal(result.song.metadata.key, undefined);
  assert.equal(result.song.metadata.duration, undefined);
});

test('invalid optional metadata is omitted without guessing values or retaining unsafe links', () => {
  assert.equal(sanitizeMetadata({ key: 'x'.repeat(301), capo: 1.5, tempo: -4, duration: Infinity,
    tuning: ['E', 'not a note'], year: 0, releaseDate: '2023-02-29',
    artworkUrl: 'http://example.com/image',
    mediaLinks: [{ kind: 'video', url: 'javascript:alert(1)' }, { kind: 'audio', url: 'https://user:password@example.com/' }],
    credits: [{ role: '', name: 'An artist' }],
  }), undefined);
  assert.deepEqual(sanitizeMetadata({ capo: 0, duration: 0, tuning: ['D', 'A', 'D', 'G', 'B', 'E'], releaseDate: '2020-02' }),
    { capo: 0, duration: 0, tuning: ['D', 'A', 'D', 'G', 'B', 'E'], releaseDate: '2020-02' });
  assert.equal(geniusMetadata({ album: { name: 'Test' }, song_art_image_url: 'https://images.genius.com/fallback.jpg',
    release_date: 'unknown', media: {}, custom_performances: [] }).artworkUrl, 'https://images.genius.com/fallback.jpg');
});

test('Deezer art and media survive an opaque selection on a fresh service', async () => {
  const record = { id: 701, title: 'Paper Satellites (Live)', title_version: '(Live)', artist: { name: 'Fixture Ensemble' },
    duration: 123, album: { title: 'Test Record', cover_xl: 'http://cdn-images.dzcdn.net/images/cover/fixture.jpg' },
    link: 'http://www.deezer.com/track/701', preview: 'http://cdnt-preview.dzcdn.net/preview.mp3' };
  const first = createLyricsService({ http: fakeHttp({ data: [record] }) });
  const candidate = (await first.search('paper', 'lyricsovh')).results[0];
  assert.match(candidate.id, /^v2\./);
  const fresh = createLyricsService({ http: fakeHttp({ lyrics: words }) });
  const result = await fresh.getLyrics('lyricsovh', candidate.id);
  assert.deepEqual(result.song.metadata, candidate.metadata);
  assert.equal(result.song.metadata.artworkUrl, 'https://cdn-images.dzcdn.net/images/cover/fixture.jpg');
  assert.deepEqual(result.song.metadata.mediaLinks.map(link => link.kind), ['audio', 'preview']);
  assert.equal(result.song.metadata.recording, '(Live)');
  assert.equal(deezerHttpsUrl('http://unknown.example/track'), undefined);
  assert.equal(deezerHttpsUrl('http://www.deezer.com.attacker.example/track'), undefined);
});

test('tampered v2 metadata cannot add unsafe media or alter the lyric destination', async () => {
  const values = [2, 'lyricsovh', '701', 'Paper Satellites', 'Fixture Ensemble', null, 123, null,
    { artworkUrl: 'http://127.0.0.1/private' }];
  const id = 'v2.' + Buffer.from(JSON.stringify(values)).toString('base64url');
  await assert.rejects(createLyricsService({ http: fakeHttp() }).getLyrics('lyricsovh', id), { code: 'INVALID_ID' });
});

test('LRCLIB-based providers retain album and duration without invented musical facts', async () => {
  const data = { id: 42, trackName: 'Paper Satellites', artistName: 'Fixture Ensemble',
    albumName: 'Test Record', duration: 123.5, plainLyrics: words };
  const lrclib = await createLyricsService({ http: fakeHttp(data) }).getLyrics('lrclib', '42');
  assert.deepEqual(lrclib.song.metadata, { album: 'Test Record', duration: 123.5 });
  const better = await createLyricsService({ http: fakeHttp(data, { ttml: `<tt><body><p>${words}</p></body></tt>` }) }).getLyrics('betterlyrics', '42');
  assert.deepEqual(better.song.metadata, lrclib.song.metadata);
  const sync = { id: '0123456789abcdef0123456789abcdef', track: data.trackName,
    artist: data.artistName, album: data.albumName, duration: data.duration, lyrics: { plain: words } };
  const synclrc = createLyricsService({ http: fakeHttp({ results: [sync] }, { results: [sync] }) });
  const candidate = (await synclrc.search('paper', 'synclrc')).results[0];
  assert.deepEqual((await synclrc.getLyrics('synclrc', candidate.id)).song.metadata, lrclib.song.metadata);
});

test('thumbnail selection picks largest secure image and skips malformed entries', () => {
  assert.equal(thumbnailUrl([{ url: 'https://images.example/small.jpg', width: 64 },
    { url: 'http://images.example/insecure.jpg', width: 9999 },
    { url: 'https://images.example/large.jpg', width: 640 }, null]), 'https://images.example/large.jpg');
});
