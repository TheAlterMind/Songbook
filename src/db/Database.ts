import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

export interface SongLine {
  text: string;
  chord?: string;
}

export interface Song {
  id?: number;
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  mood?: string;
  language?: string;
  year?: string;
  key?: string;
  favorite?: boolean;
  /** Album cover URL. null: not looked up yet. '': looked up, none found. */
  cover?: string | null;
  lines: SongLine[];
  createdAt?: number;
}

export interface Collection {
  id?: number;
  name: string;
  createdAt?: number;
}

let db: SQLite.SQLiteDatabase | null = null;
let opening: Promise<SQLite.SQLiteDatabase> | null = null;

const DB_NAME = 'lyrics_library_v2.db';

/** Thrown when this tab can't have the library because another tab or window is holding it. */
export class DatabaseBusyError extends Error {
  constructor(reload = false) {
    super(
      reload
        ? 'Songbook is open in another tab or window. Close it there, then reload this page.'
        : 'Songbook is open in another tab or window, which is holding your library. Close it there, then try again.'
    );
    this.name = 'DatabaseBusyError';
  }
}

// On web the database is one browser file (OPFS) that only one tab may hold open. expo-sqlite only lets go
// of it when the tab closes or reloads (closeAsync does not), and a tab whose open attempt is refused is left
// unable to open it until it reloads. So a Web Lock guards the file: a tab holds the lock for as long as it
// has the database, and another tab only tries to open once the lock is free, i.e. the first tab is gone.
const LOCK = 'songbook-database';
const WAIT_FOR_LOCK_MS = 5000;
const isWeb = Platform.OS === 'web' && typeof navigator !== 'undefined';
const isLockError = (e: any) =>
  isWeb && /NoModificationAllowedError|Access Handles cannot be created|Invalid VFS state/i.test(String(e?.name) + String(e?.message));

let releaseLock: (() => void) | null = null;

/** Waits (up to a few seconds) until no other tab holds the database. */
async function acquireLock(): Promise<void> {
  const locks = isWeb ? (navigator as any).locks : null;
  if (!locks || releaseLock) return;
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), WAIT_FOR_LOCK_MS);
  try {
    await new Promise<void>((granted, failed) => {
      locks
        .request(LOCK, { signal: timeout.signal }, () => new Promise<void>((release) => {
          releaseLock = release;
          granted();
        }))
        .catch(failed);
    });
  } catch {
    throw new DatabaseBusyError();
  } finally {
    clearTimeout(timer);
  }
}

function freeLock() {
  releaseLock?.();
  releaseLock = null;
}

export async function getDb() {
  if (db) return db;
  // One open at a time: two parallel opens would fight over the same file.
  if (!opening) {
    opening = (async () => {
      await acquireLock();
      try {
        const opened = await SQLite.openDatabaseAsync(DB_NAME);
        await initSchema(opened);
        db = opened;
        return opened;
      } catch (e) {
        freeLock();
        // Held by a tab outside the lock (an older version of the app): only a reload recovers.
        if (isLockError(e)) throw new DatabaseBusyError(true);
        throw e;
      }
    })().finally(() => {
      opening = null;
    });
  }
  return opening;
}

async function initSchema(db: SQLite.SQLiteDatabase) {
  {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS songs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT,
        genre TEXT,
        mood TEXT,
        language TEXT,
        year TEXT,
        key TEXT,
        favorite INTEGER NOT NULL DEFAULT 0,
        linesJson TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        cover TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
      CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);

      CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS collection_songs (
        collection_id INTEGER NOT NULL,
        song_id INTEGER NOT NULL,
        PRIMARY KEY (collection_id, song_id)
      );
    `);
    // Libraries made before covers existed get the column added.
    const cols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(songs)');
    if (!cols.some((c) => c.name === 'cover')) await db.execAsync('ALTER TABLE songs ADD COLUMN cover TEXT');
  }
}

function rowToSong(row: any): Song {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album ?? '',
    genre: row.genre ?? '',
    mood: row.mood ?? '',
    language: row.language ?? '',
    year: row.year ?? '',
    key: row.key ?? '',
    favorite: !!row.favorite,
    cover: row.cover ?? null,
    lines: JSON.parse(row.linesJson || '[]'),
    createdAt: row.createdAt,
  };
}

export async function addSong(song: Song): Promise<number> {
  const database = await getDb();
  const result = await database.runAsync(
    `INSERT INTO songs (title, artist, album, genre, mood, language, year, key, favorite, linesJson, createdAt, cover)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    song.title,
    song.artist,
    song.album ?? '',
    song.genre ?? '',
    song.mood ?? '',
    song.language ?? '',
    song.year ?? '',
    song.key ?? '',
    song.favorite ? 1 : 0,
    JSON.stringify(song.lines || []),
    Date.now(),
    song.cover ?? null
  );
  return result.lastInsertRowId as number;
}

export async function updateSong(song: Song): Promise<void> {
  const database = await getDb();
  // A different title or artist may be a different recording: look its cover up again.
  const before = await database.getFirstAsync<any>('SELECT title, artist, album FROM songs WHERE id=?', song.id as number);
  const changed = !!before && (before.title !== song.title || before.artist !== song.artist || (before.album ?? '') !== (song.album ?? ''));
  if (changed) await database.runAsync('UPDATE songs SET cover=NULL WHERE id=?', song.id as number);
  await database.runAsync(
    `UPDATE songs SET title=?, artist=?, album=?, genre=?, mood=?, language=?, year=?, key=?, favorite=?, linesJson=? WHERE id=?`,
    song.title,
    song.artist,
    song.album ?? '',
    song.genre ?? '',
    song.mood ?? '',
    song.language ?? '',
    song.year ?? '',
    song.key ?? '',
    song.favorite ? 1 : 0,
    JSON.stringify(song.lines || []),
    song.id as number
  );
}

/** Sets the cover: a URL, '' for none, or null to have it looked up again. */
export async function setSongCover(id: number, cover: string | null): Promise<void> {
  const database = await getDb();
  await database.runAsync('UPDATE songs SET cover=? WHERE id=?', cover, id);
}

export async function setFavorite(id: number, favorite: boolean): Promise<void> {
  const database = await getDb();
  await database.runAsync('UPDATE songs SET favorite=? WHERE id=?', favorite ? 1 : 0, id);
}

export async function deleteSong(id: number): Promise<void> {
  const database = await getDb();
  await database.runAsync('DELETE FROM songs WHERE id=?', id);
  await database.runAsync('DELETE FROM collection_songs WHERE song_id=?', id);
}

/** Puts a deleted song back under its old id, with its collections (used by Undo). */
export async function restoreSong(song: Song, collectionIds: number[]): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `INSERT OR REPLACE INTO songs (id, title, artist, album, genre, mood, language, year, key, favorite, linesJson, createdAt, cover)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    song.id as number,
    song.title,
    song.artist,
    song.album ?? '',
    song.genre ?? '',
    song.mood ?? '',
    song.language ?? '',
    song.year ?? '',
    song.key ?? '',
    song.favorite ? 1 : 0,
    JSON.stringify(song.lines || []),
    song.createdAt ?? Date.now(),
    song.cover ?? null
  );
  for (const cid of collectionIds) {
    await database.runAsync('INSERT OR IGNORE INTO collection_songs (collection_id, song_id) VALUES (?, ?)', cid, song.id as number);
  }
}

export async function getAllSongs(): Promise<Song[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<any>('SELECT * FROM songs');
  return rows.map(rowToSong);
}

export async function getSong(id: number): Promise<Song | null> {
  const database = await getDb();
  const row = await database.getFirstAsync<any>('SELECT * FROM songs WHERE id=?', id);
  return row ? rowToSong(row) : null;
}

export async function duplicateSong(id: number): Promise<number | null> {
  const song = await getSong(id);
  if (!song) return null;
  return addSong({
    title: `${song.title} (Copy)`,
    artist: song.artist,
    album: song.album,
    genre: song.genre,
    mood: song.mood,
    language: song.language,
    year: song.year,
    key: song.key,
    favorite: false,
    cover: song.cover,
    lines: song.lines,
  });
}

export async function searchSongs(query: string): Promise<Song[]> {
  const database = await getDb();
  const like = `%${query}%`;
  const rows = await database.getAllAsync<any>(
    'SELECT * FROM songs WHERE title LIKE ? OR artist LIKE ? OR album LIKE ? OR linesJson LIKE ?',
    like,
    like,
    like,
    like
  );
  return rows.map(rowToSong);
}

// ---- Collections ----

export async function addCollection(name: string): Promise<number> {
  const database = await getDb();
  const result = await database.runAsync('INSERT INTO collections (name, createdAt) VALUES (?, ?)', name, Date.now());
  return result.lastInsertRowId as number;
}

export async function deleteCollection(id: number): Promise<void> {
  const database = await getDb();
  await database.runAsync('DELETE FROM collections WHERE id=?', id);
  await database.runAsync('DELETE FROM collection_songs WHERE collection_id=?', id);
}

export async function getAllCollections(): Promise<Collection[]> {
  const database = await getDb();
  return database.getAllAsync<Collection>('SELECT * FROM collections ORDER BY createdAt DESC');
}

export async function getCollectionSongIds(collectionId: number): Promise<number[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<{ song_id: number }>(
    'SELECT song_id FROM collection_songs WHERE collection_id=?',
    collectionId
  );
  return rows.map((r) => r.song_id);
}

export async function getSongCollectionIds(songId: number): Promise<number[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<{ collection_id: number }>(
    'SELECT collection_id FROM collection_songs WHERE song_id=?',
    songId
  );
  return rows.map((r) => r.collection_id);
}

export async function setSongInCollection(collectionId: number, songId: number, inCollection: boolean): Promise<void> {
  const database = await getDb();
  if (inCollection) {
    await database.runAsync(
      'INSERT OR IGNORE INTO collection_songs (collection_id, song_id) VALUES (?, ?)',
      collectionId,
      songId
    );
  } else {
    await database.runAsync('DELETE FROM collection_songs WHERE collection_id=? AND song_id=?', collectionId, songId);
  }
}

export async function getSongsByIds(ids: number[]): Promise<Song[]> {
  if (ids.length === 0) return [];
  const database = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  const rows = await database.getAllAsync<any>(`SELECT * FROM songs WHERE id IN (${placeholders})`, ...ids);
  return rows.map(rowToSong);
}

// ---- Export / Import ----

export async function getAllDataForExport() {
  const songs = await getAllSongs();
  const collections = await getAllCollections();
  const database = await getDb();
  const links = await database.getAllAsync<{ collection_id: number; song_id: number }>(
    'SELECT collection_id, song_id FROM collection_songs'
  );
  return { songs, collections, links, exportedAt: Date.now(), version: 1 };
}

export async function importData(data: {
  songs: Song[];
  collections: Collection[];
  links: { collection_id: number; song_id: number }[];
}) {
  const existing = await getAllSongs();
  const keyOf = (s: Song) => `${s.title.trim().toLowerCase()}|${s.artist.trim().toLowerCase()}`;
  const existingKeys = new Set(existing.map(keyOf));

  const oldIdToNewId = new Map<number, number>();
  let imported = 0;
  let skipped = 0;

  for (const song of data.songs || []) {
    if (existingKeys.has(keyOf(song))) {
      skipped++;
      continue;
    }
    const newId = await addSong(song);
    if (song.id != null) oldIdToNewId.set(song.id, newId);
    imported++;
  }

  const existingCollections = await getAllCollections();
  const collectionNameToId = new Map<string, number>();
  existingCollections.forEach((c) => collectionNameToId.set(c.name, c.id as number));

  for (const col of data.collections || []) {
    if (!collectionNameToId.has(col.name)) {
      const newId = await addCollection(col.name);
      collectionNameToId.set(col.name, newId);
    }
  }

  for (const link of data.links || []) {
    const newSongId = oldIdToNewId.get(link.song_id);
    if (newSongId == null) continue;
    const col = (data.collections || []).find((c) => c.id === link.collection_id);
    if (!col) continue;
    const newCollectionId = collectionNameToId.get(col.name);
    if (newCollectionId == null) continue;
    await setSongInCollection(newCollectionId, newSongId, true);
  }

  return { imported, skipped };
}
