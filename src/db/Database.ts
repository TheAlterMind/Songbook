import * as SQLite from 'expo-sqlite';
import { readLyricsProvenance, songContentKey, validateBackup, validateLyricsProvenance, validateSongMetadata, validateSourceDetails, validateSongLines, readSongMetadata, readSourceDetails } from './backup';
import type { ChordAnchor, SongMetadata, SourceDetails } from '../songMetadata';

export interface LyricsProvenance {
  provider: string;
  providerSongId: string;
  sourceUrl?: string;
  attribution?: { name: string; text?: string; url?: string };
  retrievedAt: number;
  modifiedSinceImport?: boolean;
}

export interface SongLine {
  text: string;
  chord?: string;
  chords?: ChordAnchor[];
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
  lines: SongLine[];
  createdAt?: number;
  lyricsSource?: LyricsProvenance;
  metadata?: SongMetadata;
  sourceDetails?: SourceDetails[];
}

export interface Collection {
  id?: number;
  name: string;
  createdAt?: number;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function initializeDatabase(): Promise<SQLite.SQLiteDatabase> {
  const database = await SQLite.openDatabaseAsync('lyrics_library_v2.db');
  try {
    await database.execAsync('PRAGMA journal_mode = WAL;');
    await database.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(`
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
        lyricsSourceJson TEXT,
        metadataJson TEXT,
        sourceDetailsJson TEXT
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
      const version = await txn.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      if ((version?.user_version ?? 0) < 1) {
        const columns = await txn.getAllAsync<{ name: string }>('PRAGMA table_info(songs)');
        if (!columns.some((column) => column.name === 'lyricsSourceJson')) {
          await txn.execAsync('ALTER TABLE songs ADD COLUMN lyricsSourceJson TEXT;');
        }
        await txn.execAsync('PRAGMA user_version = 1;');
      }
      if ((version?.user_version ?? 0) < 2) {
        const columns = await txn.getAllAsync<{ name: string }>('PRAGMA table_info(songs)');
        for (const name of ['metadataJson', 'sourceDetailsJson']) {
          if (!columns.some((column) => column.name === name)) await txn.execAsync(`ALTER TABLE songs ADD COLUMN ${name} TEXT;`);
        }
        await txn.execAsync('PRAGMA user_version = 2;');
      }
    });
    return database;
  } catch (error) {
    await database.closeAsync().catch(() => undefined);
    throw error;
  }
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = initializeDatabase().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

function rowToSong(row: any): Song {
  const metadata = readSongMetadata(row.metadataJson);
  const sourceDetails = readSourceDetails(row.sourceDetailsJson);
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
    lines: JSON.parse(row.linesJson || '[]'),
    createdAt: row.createdAt,
    lyricsSource: readLyricsProvenance(row.lyricsSourceJson),
    ...(metadata ? { metadata } : {}),
    ...(sourceDetails ? { sourceDetails } : {}),
  };
}

async function insertSong(database: Pick<SQLite.SQLiteDatabase, 'runAsync'>, song: Song): Promise<number> {
  const source = validateLyricsProvenance(song.lyricsSource);
  const metadata = validateSongMetadata(song.metadata);
  const sourceDetails = validateSourceDetails(song.sourceDetails);
  const lines = validateSongLines(song.lines || []);
  const result = await database.runAsync(
    `INSERT INTO songs (title, artist, album, genre, mood, language, year, key, favorite, linesJson, createdAt, lyricsSourceJson, metadataJson, sourceDetailsJson)
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
    JSON.stringify(lines),
    song.createdAt ?? Date.now(),
    source ? JSON.stringify(source) : null,
    metadata ? JSON.stringify(metadata) : null,
    sourceDetails ? JSON.stringify(sourceDetails) : null
  );
  return result.lastInsertRowId as number;
}

export async function addSong(song: Song): Promise<number> {
  return insertSong(await getDb(), song);
}

export async function updateSong(song: Song): Promise<void> {
  const database = await getDb();
  const source = validateLyricsProvenance(song.lyricsSource);
  const metadata = validateSongMetadata(song.metadata);
  const sourceDetails = validateSourceDetails(song.sourceDetails);
  const lines = validateSongLines(song.lines || []);
  await database.runAsync(
    `UPDATE songs SET title=?, artist=?, album=?, genre=?, mood=?, language=?, year=?, key=?, favorite=?, linesJson=?, lyricsSourceJson=?, metadataJson=?, sourceDetailsJson=? WHERE id=?`,
    song.title,
    song.artist,
    song.album ?? '',
    song.genre ?? '',
    song.mood ?? '',
    song.language ?? '',
    song.year ?? '',
    song.key ?? '',
    song.favorite ? 1 : 0,
    JSON.stringify(lines),
    source ? JSON.stringify(source) : null,
    metadata ? JSON.stringify(metadata) : null,
    sourceDetails ? JSON.stringify(sourceDetails) : null,
    song.id as number
  );
}

export async function setFavorite(id: number, favorite: boolean): Promise<void> {
  const database = await getDb();
  await database.runAsync('UPDATE songs SET favorite=? WHERE id=?', favorite ? 1 : 0, id);
}

export async function deleteSong(id: number): Promise<void> {
  const database = await getDb();
  await database.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('DELETE FROM collection_songs WHERE song_id=?', id);
    await txn.runAsync('DELETE FROM songs WHERE id=?', id);
  });
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
    ...song,
    id: undefined,
    createdAt: undefined,
    title: `${song.title} (Copy)`,
    favorite: false,
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
  await database.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('DELETE FROM collection_songs WHERE collection_id=?', id);
    await txn.runAsync('DELETE FROM collections WHERE id=?', id);
  });
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
  const database = await getDb();
  const data = {
    songs: [] as Song[],
    collections: [] as Collection[],
    links: [] as { collection_id: number; song_id: number }[],
    exportedAt: Date.now(),
    version: 3 as const,
  };
  await database.withExclusiveTransactionAsync(async (txn) => {
    data.songs = (await txn.getAllAsync<any>('SELECT * FROM songs')).map(rowToSong);
    data.collections = await txn.getAllAsync<Collection>('SELECT * FROM collections ORDER BY createdAt DESC');
    data.links = await txn.getAllAsync<{ collection_id: number; song_id: number }>('SELECT collection_id, song_id FROM collection_songs');
  });
  return data;
}

export async function importData(value: unknown): Promise<{ imported: number; skipped: number }> {
  // Validate everything before opening a write transaction. No partial restore
  // should survive an invalid record or a failed database operation.
  const data = validateBackup(value);
  const database = await getDb();
  let imported = 0;
  let skipped = 0;
  await database.withExclusiveTransactionAsync(async (txn) => {
    const existing = (await txn.getAllAsync<any>('SELECT * FROM songs')).map(rowToSong);
    const songsByContent = new Map(existing.map((song) => [songContentKey(song), song]));
    const oldIdToNewId = new Map<number, number>();
    for (const song of data.songs) {
      const key = songContentKey(song);
      const match = songsByContent.get(key);
      let newId: number;
      if (match) {
        newId = match.id as number;
        // An older/manual copy can acquire credits from a backup without
        // replacing the local arrangement or existing source attribution.
        if (!match.lyricsSource && song.lyricsSource) {
          await txn.runAsync('UPDATE songs SET lyricsSourceJson=? WHERE id=?', JSON.stringify(song.lyricsSource), newId);
          match.lyricsSource = song.lyricsSource;
        }
        if (!match.metadata && song.metadata) {
          await txn.runAsync('UPDATE songs SET metadataJson=? WHERE id=?', JSON.stringify(song.metadata), newId);
          match.metadata = song.metadata;
        }
        if (!match.sourceDetails && song.sourceDetails) {
          await txn.runAsync('UPDATE songs SET sourceDetailsJson=? WHERE id=?', JSON.stringify(song.sourceDetails), newId);
          match.sourceDetails = song.sourceDetails;
        }
        skipped++;
      } else {
        newId = await insertSong(txn, song);
        songsByContent.set(key, { ...song, id: newId });
        imported++;
      }
      if (song.id != null) oldIdToNewId.set(song.id, newId);
    }
    const collections = await txn.getAllAsync<Collection>('SELECT * FROM collections');
    const collectionNameToId = new Map(collections.map((collection) => [collection.name, collection.id as number]));
    const oldCollectionIdToNewId = new Map<number, number>();
    for (const collection of data.collections) {
      let newId = collectionNameToId.get(collection.name);
      if (newId == null) {
        const result = await txn.runAsync('INSERT INTO collections (name, createdAt) VALUES (?, ?)', collection.name, collection.createdAt ?? Date.now());
        newId = result.lastInsertRowId;
        collectionNameToId.set(collection.name, newId);
      }
      if (collection.id != null) oldCollectionIdToNewId.set(collection.id, newId);
    }
    for (const link of data.links) {
      await txn.runAsync(
        'INSERT OR IGNORE INTO collection_songs (collection_id, song_id) VALUES (?, ?)',
        oldCollectionIdToNewId.get(link.collection_id) as number,
        oldIdToNewId.get(link.song_id) as number
      );
    }
  });
  return { imported, skipped };
}
