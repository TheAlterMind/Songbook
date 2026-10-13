import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';

const databaseUrl = new URL('../../src/db/Database.ts', import.meta.url);
const backupUrl = new URL('../../src/db/backup.ts', import.meta.url);
const mockSqliteUrl = 'data:text/javascript,' + encodeURIComponent(
  'export async function openDatabaseAsync(name) { return globalThis[Symbol.for("songbook.test.sqlite")](name); }'
);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'expo-sqlite') return { url: mockSqliteUrl, shortCircuit: true };
    if (specifier === './backup' && context.parentURL?.startsWith(databaseUrl.href)) {
      return { url: backupUrl.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { validateBackup, validateLyricsProvenance, songContentKey } = await import(backupUrl.href);

const source = {
  provider: 'youtubemusic', providerSongId: 'recording-1',
  sourceUrl: 'https://music.youtube.com/watch?v=recording-1',
  attribution: { name: 'Example publisher', text: 'Source: Example publisher', url: 'https://example.org/credits' },
  retrievedAt: 1700000000000,
};
const song = (id = 1, extra = {}) => ({
  id, title: 'Test song', artist: 'Test artist', album: 'Test album',
  lines: [{ text: 'A synthetic lyric', chord: 'G' }, { text: '' }, { text: 'Another test line' }],
  favorite: true, createdAt: 1600000000000, ...extra,
});
const backup = (songs = [song()], extra = {}) => ({
  version: 1, exportedAt: 1700000000000, songs,
  collections: [{ id: 7, name: 'Set list', createdAt: 1500000000000 }],
  links: [{ song_id: songs[0]?.id, collection_id: 7 }], ...extra,
});

let counter = 0;
async function fixture({ legacy = false, failInitializationOnce = false } = {}) {
  const native = new DatabaseSync(':memory:');
  let failure = null;
  let opens = 0;
  let closes = 0;
  if (legacy) {
    native.exec(`
      CREATE TABLE songs (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
        artist TEXT NOT NULL, album TEXT, genre TEXT, mood TEXT, language TEXT,
        year TEXT, key TEXT, favorite INTEGER NOT NULL DEFAULT 0,
        linesJson TEXT NOT NULL, createdAt INTEGER NOT NULL);
      CREATE TABLE collections (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, createdAt INTEGER NOT NULL);
      CREATE TABLE collection_songs (collection_id INTEGER NOT NULL, song_id INTEGER NOT NULL, PRIMARY KEY (collection_id, song_id));
    `);
    native.prepare('INSERT INTO songs (id,title,artist,album,favorite,linesJson,createdAt) VALUES (?,?,?,?,?,?,?)')
      .run(42, 'Legacy song', 'Legacy artist', 'Old album', 1, JSON.stringify(song().lines), 1400000000000);
    native.exec("INSERT INTO collections VALUES (9,'Old collection',1300000000000); INSERT INTO collection_songs VALUES (9,42);");
  }
  const check = (sql) => {
    if (failure?.(sql)) throw new Error('Injected database failure');
  };
  const adapter = {
    async execAsync(sql) { check(sql); native.exec(sql); },
    async runAsync(sql, ...parameters) {
      check(sql);
      const result = native.prepare(sql).run(...parameters);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async getAllAsync(sql, ...parameters) { check(sql); return native.prepare(sql).all(...parameters).map((row) => ({ ...row })); },
    async getFirstAsync(sql, ...parameters) {
      check(sql);
      const row = native.prepare(sql).get(...parameters);
      return row ? { ...row } : null;
    },
    async withExclusiveTransactionAsync(task) {
      native.exec('BEGIN IMMEDIATE');
      try { await task(adapter); native.exec('COMMIT'); }
      catch (error) { native.exec('ROLLBACK'); throw error; }
    },
    async closeAsync() { closes++; },
  };
  globalThis[Symbol.for('songbook.test.sqlite')] = async (name) => {
    assert.equal(name, 'lyrics_library_v2.db');
    opens++;
    if (failInitializationOnce && opens === 1) {
      return { ...adapter, execAsync: async () => { throw new Error('Initialization failed'); } };
    }
    return adapter;
  };
  const api = await import(`${databaseUrl.href}?test=${++counter}`);
  return {
    api, native,
    failWhen(predicate) { failure = predicate; },
    get opens() { return opens; }, get closes() { return closes; },
    close() { native.close(); },
  };
}

test('existing database migrates in place without changing lyrics, dates, favorites or links', async () => {
  const f = await fixture({ legacy: true });
  try {
    const [first, second] = await Promise.all([f.api.getDb(), f.api.getDb()]);
    assert.equal(first, second);
    assert.equal(f.opens, 1);
    const saved = await f.api.getSong(42);
    assert.deepEqual(saved.lines, song().lines);
    assert.equal(saved.createdAt, 1400000000000);
    assert.equal(saved.favorite, true);
    assert.equal(saved.lyricsSource, undefined);
    assert.deepEqual(await f.api.getCollectionSongIds(9), [42]);
    assert.equal(f.native.prepare('PRAGMA user_version').get().user_version, 1);
    assert.ok(f.native.prepare('PRAGMA table_info(songs)').all().some((column) => column.name === 'lyricsSourceJson'));
  } finally { f.close(); }
});

test('failed initialization is closed and a later attempt can retry', async () => {
  const f = await fixture({ failInitializationOnce: true });
  try {
    await assert.rejects(f.api.getDb(), /Initialization failed/);
    assert.equal(f.closes, 1);
    await f.api.getDb();
    assert.equal(f.opens, 2);
  } finally { f.close(); }
});

test('lyrics provenance survives persistence, edits, duplication and v2 export', async () => {
  const f = await fixture();
  try {
    const id = await f.api.addSong(song(undefined, { lyricsSource: source }));
    const original = await f.api.getSong(id);
    assert.deepEqual(original.lyricsSource, source);
    const edited = { ...original, title: 'Edited title', lyricsSource: { ...source, modifiedSinceImport: true } };
    await f.api.updateSong(edited);
    const copyId = await f.api.duplicateSong(id);
    const copy = await f.api.getSong(copyId);
    assert.deepEqual(copy.lyricsSource, edited.lyricsSource);
    assert.deepEqual(copy.lines, edited.lines);
    assert.equal(copy.favorite, false);
    assert.ok(copy.createdAt > original.createdAt);
    const exported = await f.api.getAllDataForExport();
    assert.equal(exported.version, 2);
    assert.deepEqual(exported.songs[0].lyricsSource, edited.lyricsSource);
    assert.doesNotThrow(() => validateBackup(JSON.parse(JSON.stringify(exported))));
  } finally { f.close(); }
});

test('v1 backups restore dates and attach collections to reused songs', async () => {
  const f = await fixture();
  try {
    const existingId = await f.api.addSong(song());
    const result = await f.api.importData(backup());
    assert.deepEqual(result, { imported: 0, skipped: 1 });
    const collections = await f.api.getAllCollections();
    assert.equal(collections[0].createdAt, 1500000000000);
    assert.deepEqual(await f.api.getCollectionSongIds(collections[0].id), [existingId]);
    assert.equal((await f.api.getSong(existingId)).createdAt, 1600000000000);
  } finally { f.close(); }
});

test('v2 backup roundtrip preserves source, lyric spacing, chords, dates and memberships', async () => {
  const first = await fixture();
  let exported;
  try {
    await first.api.importData(backup([song(81, { lyricsSource: source })], { version: 2 }));
    exported = JSON.parse(JSON.stringify(await first.api.getAllDataForExport()));
  } finally { first.close(); }
  const second = await fixture();
  try {
    await second.api.importData(exported);
    const restored = await second.api.getAllDataForExport();
    assert.deepEqual(restored.songs, exported.songs);
    assert.deepEqual(restored.collections, exported.collections);
    assert.deepEqual(restored.links, exported.links);
  } finally { second.close(); }
});

test('long Unicode provider selections and encoded source URLs survive saving and backup roundtrip', async () => {
  const title = 'Пісня про вечір '.repeat(18).trim();
  const artist = 'Український ансамбль '.repeat(12).trim();
  const album = 'Концертний запис '.repeat(16).trim();
  assert.ok(title.length <= 300 && artist.length <= 300 && album.length <= 300);
  const providerSongId = 'v1.' + Buffer.from(JSON.stringify([1, 'lyricsovh', '123456', title, artist, album, 215, null]), 'utf8').toString('base64url');
  const sourceUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
  assert.ok(providerSongId.length > 1000 && providerSongId.length <= 8192);
  assert.ok(sourceUrl.length > 2048 && sourceUrl.length <= 8192);
  const lyricsSource = { provider: 'lyricsovh', providerSongId, sourceUrl, retrievedAt: 1700000000000 };
  const first = await fixture();
  let exported;
  try {
    const id = await first.api.addSong(song(undefined, { title, artist, album, lyricsSource }));
    assert.deepEqual((await first.api.getSong(id)).lyricsSource, lyricsSource);
    exported = JSON.parse(JSON.stringify(await first.api.getAllDataForExport()));
    assert.deepEqual(validateBackup(exported).songs[0].lyricsSource, lyricsSource);
  } finally { first.close(); }
  const second = await fixture();
  try {
    await second.api.importData(exported);
    assert.deepEqual((await second.api.getAllSongs())[0].lyricsSource, lyricsSource);
  } finally { second.close(); }
  assert.equal(validateLyricsProvenance({ ...lyricsSource, providerSongId: 'x'.repeat(8192) }).providerSongId.length, 8192);
  assert.throws(() => validateLyricsProvenance({ ...lyricsSource, providerSongId: 'x'.repeat(8193) }), /Provider song ID/);
  assert.throws(() => validateLyricsProvenance({ ...lyricsSource, sourceUrl: 'https://example.org/' + 'x'.repeat(8193) }), /Lyrics source URL/);
});

test('duplicates within a backup share one song and retain all memberships', async () => {
  const f = await fixture();
  try {
    const input = backup([song(11), song(12)], {
      links: [{ collection_id: 7, song_id: 11 }, { collection_id: 7, song_id: 12 }],
    });
    assert.deepEqual(await f.api.importData(input), { imported: 1, skipped: 1 });
    assert.equal((await f.api.getAllSongs()).length, 1);
    const exported = await f.api.getAllDataForExport();
    assert.equal(exported.links.length, 1);
  } finally { f.close(); }
});

test('same-title different arrangements are retained; an identical older copy gains credits', async () => {
  const f = await fixture();
  try {
    await f.api.addSong(song());
    const changed = song(2, { lines: [{ text: 'A different synthetic arrangement', chord: 'Am' }] });
    const input = backup([song(1, { lyricsSource: source }), changed], { version: 2 });
    assert.deepEqual(await f.api.importData(input), { imported: 1, skipped: 1 });
    const songs = await f.api.getAllSongs();
    assert.equal(songs.length, 2);
    assert.deepEqual(songs[0].lyricsSource, source);
    assert.deepEqual(songs[1].lines, changed.lines);
  } finally { f.close(); }
});

test('invalid backup fails before mutations and a mid-write failure rolls back songs and collections', async () => {
  const f = await fixture();
  try {
    await f.api.addSong(song(undefined, { title: 'Existing local song' }));
    await assert.rejects(f.api.importData(backup([song(1), song(2, { title: 123 })])), /Song title/);
    assert.equal((await f.api.getAllSongs()).length, 1);
    f.failWhen((sql) => sql.startsWith('INSERT OR IGNORE INTO collection_songs'));
    await assert.rejects(f.api.importData(backup()), /Injected database failure/);
    f.failWhen(null);
    assert.equal((await f.api.getAllSongs()).length, 1);
    assert.deepEqual(await f.api.getAllCollections(), []);
  } finally { f.close(); }
});

test('failed song or collection deletion leaves both the record and its memberships intact', async () => {
  const f = await fixture();
  try {
    await f.api.importData(backup());
    const savedSong = (await f.api.getAllSongs())[0];
    const collection = (await f.api.getAllCollections())[0];
    f.failWhen((sql) => sql.startsWith('DELETE FROM songs'));
    await assert.rejects(f.api.deleteSong(savedSong.id), /Injected database failure/);
    f.failWhen(null);
    assert.ok(await f.api.getSong(savedSong.id));
    assert.deepEqual(await f.api.getCollectionSongIds(collection.id), [savedSong.id]);
    f.failWhen((sql) => sql.startsWith('DELETE FROM collections'));
    await assert.rejects(f.api.deleteCollection(collection.id), /Injected database failure/);
    f.failWhen(null);
    assert.equal((await f.api.getAllCollections()).length, 1);
    assert.deepEqual(await f.api.getCollectionSongIds(collection.id), [savedSong.id]);
    const exported = await f.api.getAllDataForExport();
    assert.doesNotThrow(() => validateBackup(JSON.parse(JSON.stringify(exported))));
    await f.api.deleteSong(savedSong.id);
    assert.equal(await f.api.getSong(savedSong.id), null);
    assert.deepEqual(await f.api.getCollectionSongIds(collection.id), []);
  } finally { f.close(); }
});

test('validation rejects unsupported versions, bad lines, orphan links, duplicate IDs and unsafe source URLs', () => {
  for (const invalid of [
    backup(undefined, { version: 3 }),
    backup([song(1, { lines: [{ text: 123 }] })]),
    backup(undefined, { links: [{ song_id: 999, collection_id: 7 }] }),
    backup([song(1), song(1)]),
    backup([song(1, { lyricsSource: { ...source, sourceUrl: 'javascript:alert(1)' } })]),
  ]) assert.throws(() => validateBackup(invalid));
  assert.throws(() => validateLyricsProvenance({ ...source, sourceUrl: 'https://user:secret@example.org' }));
  assert.equal(validateLyricsProvenance({ ...source, attribution: { name: 'x'.repeat(1000) } }).attribution.name.length, 1000);
  assert.notEqual(songContentKey(song()), songContentKey(song(2, { lines: [{ text: 'A synthetic lyric', chord: 'Am' }] })));
});
