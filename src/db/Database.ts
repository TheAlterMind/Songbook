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
  /** Stable id shared across devices (the numeric id is local to one database). */
  uid?: string;
  /** Last edit time (ms). Sync keeps the newest edit of each song. */
  updatedAt?: number;
  /** Set when deleted; the row is kept so the deletion can sync. */
  deletedAt?: number | null;
}

export interface Collection {
  id?: number;
  name: string;
  createdAt?: number;
  uid?: string;
  updatedAt?: number;
  deletedAt?: number | null;
}

/** A random id that is unique enough to tell records apart across devices. */
export function newUid(): string {
  const hex = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
  return `${Date.now().toString(16)}-${hex()}-${hex()}`;
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
        cover TEXT,
        uid TEXT,
        updatedAt INTEGER,
        deletedAt INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
      CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);

      CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        uid TEXT,
        updatedAt INTEGER,
        deletedAt INTEGER
      );

      CREATE TABLE IF NOT EXISTS collection_songs (
        collection_id INTEGER NOT NULL,
        song_id INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL DEFAULT 0,
        deleted INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (collection_id, song_id)
      );
    `);
    const columnsOf = async (table: string) =>
      (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)).map((c) => c.name);

    // Libraries made before covers existed get the column added.
    const songCols = await columnsOf('songs');
    if (!songCols.includes('cover')) await db.execAsync('ALTER TABLE songs ADD COLUMN cover TEXT');

    // Libraries made before sync get stable ids, edit times and delete markers.
    const collectionCols = await columnsOf('collections');
    const linkCols = await columnsOf('collection_songs');
    if (!songCols.includes('uid') || !collectionCols.includes('uid') || !linkCols.includes('deleted')) {
      // Keep a copy of the old data inside the database in case the migration goes wrong.
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS premigration_songs AS SELECT * FROM songs;
        CREATE TABLE IF NOT EXISTS premigration_collections AS SELECT * FROM collections;
        CREATE TABLE IF NOT EXISTS premigration_collection_songs AS SELECT * FROM collection_songs;
      `);
      for (const col of ['uid TEXT', 'updatedAt INTEGER', 'deletedAt INTEGER']) {
        if (!songCols.includes(col.split(' ')[0])) await db.execAsync(`ALTER TABLE songs ADD COLUMN ${col}`);
        if (!collectionCols.includes(col.split(' ')[0])) await db.execAsync(`ALTER TABLE collections ADD COLUMN ${col}`);
      }
      if (!linkCols.includes('updatedAt')) await db.execAsync('ALTER TABLE collection_songs ADD COLUMN updatedAt INTEGER NOT NULL DEFAULT 0');
      if (!linkCols.includes('deleted')) await db.execAsync('ALTER TABLE collection_songs ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0');
    }
    for (const table of ['songs', 'collections']) {
      const missing = await db.getAllAsync<{ id: number }>(`SELECT id FROM ${table} WHERE uid IS NULL`);
      for (const row of missing) await db.runAsync(`UPDATE ${table} SET uid=? WHERE id=?`, newUid(), row.id);
      await db.execAsync(`UPDATE ${table} SET updatedAt=createdAt WHERE updatedAt IS NULL`);
      await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_uid ON ${table}(uid)`);
    }
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
    uid: row.uid,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? null,
  };
}

export async function addSong(song: Song): Promise<number> {
  const database = await getDb();
  const now = Date.now();
  const result = await database.runAsync(
    `INSERT INTO songs (title, artist, album, genre, mood, language, year, key, favorite, linesJson, createdAt, cover, uid, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    now,
    song.cover ?? null,
    newUid(),
    now
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
    `UPDATE songs SET title=?, artist=?, album=?, genre=?, mood=?, language=?, year=?, key=?, favorite=?, linesJson=?, updatedAt=? WHERE id=?`,
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
    song.id as number
  );
}

/** Sets the cover: a URL, '' for none, or null to have it looked up again. */
export async function setSongCover(id: number, cover: string | null): Promise<void> {
  const database = await getDb();
  await database.runAsync('UPDATE songs SET cover=?, updatedAt=? WHERE id=?', cover, Date.now(), id);
}

export async function setFavorite(id: number, favorite: boolean): Promise<void> {
  const database = await getDb();
  await database.runAsync('UPDATE songs SET favorite=?, updatedAt=? WHERE id=?', favorite ? 1 : 0, Date.now(), id);
}

/** Marks the song deleted. The row stays so the deletion can sync; its collection links stay too, hidden. */
export async function deleteSong(id: number): Promise<void> {
  const database = await getDb();
  const now = Date.now();
  await database.runAsync('UPDATE songs SET deletedAt=?, updatedAt=? WHERE id=?', now, now, id);
}

/** Brings a deleted song back (used by Undo). Its collections come back with it. */
export async function restoreSong(song: Song, collectionIds: number[]): Promise<void> {
  const database = await getDb();
  const now = Date.now();
  const done = await database.runAsync('UPDATE songs SET deletedAt=NULL, updatedAt=? WHERE id=?', now, song.id as number);
  if (done.changes > 0) {
    for (const cid of collectionIds) await setSongInCollection(cid, song.id as number, true);
    return;
  }
  // The row is gone (should not happen): put it back under its old id.
  await database.runAsync(
    `INSERT OR REPLACE INTO songs (id, title, artist, album, genre, mood, language, year, key, favorite, linesJson, createdAt, cover, uid, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    song.createdAt ?? now,
    song.cover ?? null,
    song.uid ?? newUid(),
    now
  );
  for (const cid of collectionIds) await setSongInCollection(cid, song.id as number, true);
}

export async function getAllSongs(): Promise<Song[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<any>('SELECT * FROM songs WHERE deletedAt IS NULL');
  return rows.map(rowToSong);
}

export async function getSong(id: number): Promise<Song | null> {
  const database = await getDb();
  const row = await database.getFirstAsync<any>('SELECT * FROM songs WHERE id=? AND deletedAt IS NULL', id);
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
    'SELECT * FROM songs WHERE deletedAt IS NULL AND (title LIKE ? OR artist LIKE ? OR album LIKE ? OR linesJson LIKE ?)',
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
  const now = Date.now();
  const result = await database.runAsync(
    'INSERT INTO collections (name, createdAt, uid, updatedAt) VALUES (?, ?, ?, ?)',
    name,
    now,
    newUid(),
    now
  );
  return result.lastInsertRowId as number;
}

/** Marks the collection deleted. Its links stay, hidden, so the deletion can sync. */
export async function deleteCollection(id: number): Promise<void> {
  const database = await getDb();
  const now = Date.now();
  await database.runAsync('UPDATE collections SET deletedAt=?, updatedAt=? WHERE id=?', now, now, id);
}

export async function getAllCollections(): Promise<Collection[]> {
  const database = await getDb();
  return database.getAllAsync<Collection>('SELECT * FROM collections WHERE deletedAt IS NULL ORDER BY createdAt DESC');
}

export async function getCollectionSongIds(collectionId: number): Promise<number[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<{ song_id: number }>(
    `SELECT l.song_id FROM collection_songs l JOIN songs s ON s.id = l.song_id
     WHERE l.collection_id=? AND l.deleted=0 AND s.deletedAt IS NULL`,
    collectionId
  );
  return rows.map((r) => r.song_id);
}

export async function getSongCollectionIds(songId: number): Promise<number[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<{ collection_id: number }>(
    `SELECT l.collection_id FROM collection_songs l JOIN collections c ON c.id = l.collection_id
     WHERE l.song_id=? AND l.deleted=0 AND c.deletedAt IS NULL`,
    songId
  );
  return rows.map((r) => r.collection_id);
}

export async function setSongInCollection(collectionId: number, songId: number, inCollection: boolean): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `INSERT INTO collection_songs (collection_id, song_id, updatedAt, deleted) VALUES (?, ?, ?, ?)
     ON CONFLICT(collection_id, song_id) DO UPDATE SET deleted=excluded.deleted, updatedAt=excluded.updatedAt`,
    collectionId,
    songId,
    Date.now(),
    inCollection ? 0 : 1
  );
}

export async function getSongsByIds(ids: number[]): Promise<Song[]> {
  if (ids.length === 0) return [];
  const database = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  const rows = await database.getAllAsync<any>(`SELECT * FROM songs WHERE deletedAt IS NULL AND id IN (${placeholders})`, ...ids);
  return rows.map(rowToSong);
}

// ---- Export / Import ----

export async function getAllDataForExport() {
  const songs = await getAllSongs();
  const collections = await getAllCollections();
  const database = await getDb();
  const links = await database.getAllAsync<{ collection_id: number; song_id: number }>(
    'SELECT collection_id, song_id FROM collection_songs WHERE deleted=0'
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
